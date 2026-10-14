import json
import logging
import math
from datetime import datetime, time, timedelta, timezone
from typing import Any

from redis.exceptions import RedisError

from app.database import settings
from app.redis_client import redis_client


logger = logging.getLogger(__name__)


class AIQuotaExceeded(Exception):
    pass


class AIUsageUnavailable(AIQuotaExceeded):
    pass


_RESERVE_PROVIDER_CALL = """
local requests = tonumber(redis.call("GET", KEYS[1]) or "0")
if requests >= tonumber(ARGV[1]) then
    return -1
end
local used_tokens = tonumber(redis.call("GET", KEYS[3]) or "0")
local requested_tokens = tonumber(ARGV[3])
if used_tokens + requested_tokens > tonumber(ARGV[2]) then
    return -2
end
local total = redis.call("INCR", KEYS[1])
if total == 1 then
    redis.call("EXPIREAT", KEYS[1], ARGV[4])
end
local provider_total = redis.call("INCR", KEYS[2])
if provider_total == 1 then
    redis.call("EXPIREAT", KEYS[2], ARGV[4])
end
local token_total = redis.call("INCRBY", KEYS[3], requested_tokens)
if token_total == requested_tokens then
    redis.call("EXPIREAT", KEYS[3], ARGV[4])
end
redis.call("HINCRBY", KEYS[4], ARGV[5], 1)
redis.call("HINCRBY", KEYS[4], ARGV[6], requested_tokens)
if redis.call("TTL", KEYS[4]) < 0 then
    redis.call("EXPIREAT", KEYS[4], ARGV[4])
end
return requested_tokens
"""

_RECORD_OUTCOME = """
redis.call("HINCRBY", KEYS[1], ARGV[1], 1)
if redis.call("TTL", KEYS[1]) < 0 then
    redis.call("EXPIREAT", KEYS[1], ARGV[4])
end
local reserved_tokens = tonumber(ARGV[2])
local actual_tokens = tonumber(ARGV[3])
if actual_tokens >= 0 and actual_tokens ~= reserved_tokens then
    local delta = actual_tokens - reserved_tokens
    redis.call("INCRBY", KEYS[2], delta)
    redis.call("HINCRBY", KEYS[1], ARGV[5], delta)
end
return 1
"""

_RECORD_CACHE_HIT = """
redis.call("HINCRBY", KEYS[1], ARGV[1], 1)
if redis.call("TTL", KEYS[1]) < 0 then
    redis.call("EXPIREAT", KEYS[1], ARGV[2])
end
return 1
"""


def _usage_keys(now: datetime | None = None) -> tuple[str, str, int, str]:
    current = now or datetime.now(timezone.utc)
    current = current.astimezone(timezone.utc)
    next_day = datetime.combine(
        current.date() + timedelta(days=1),
        time.min,
        tzinfo=timezone.utc,
    )
    date_key = current.strftime("%Y%m%d")
    root = f"ai:usage:{date_key}"
    return (
        f"{root}:total",
        f"{root}:provider:",
        int(next_day.timestamp()),
        current.date().isoformat(),
    )


def _dimension_field(
    provider_name: str,
    model_name: str,
    feature: str,
    metric: str,
) -> str:
    return json.dumps(
        [provider_name, model_name, feature, metric],
        ensure_ascii=True,
        separators=(",", ":"),
    )


def estimate_token_reservation(input_text: str) -> int:
    input_tokens = math.ceil(len(input_text) / 3)
    return max(1, input_tokens) + settings.AI_MAX_COMPLETION_TOKENS


def reserve_provider_call(
    provider_name: str,
    model_name: str,
    feature: str,
    input_text: str,
) -> int:
    total_key, provider_prefix, expires_at, _date = _usage_keys()
    provider_key = f"{provider_prefix}{provider_name}"
    token_key = total_key.replace(":total", ":estimated_tokens")
    details_key = total_key.replace(":total", ":details")
    reserved_tokens = estimate_token_reservation(input_text)
    attempt_field = _dimension_field(provider_name, model_name, feature, "attempts")
    token_field = _dimension_field(
        provider_name,
        model_name,
        feature,
        "estimated_tokens",
    )
    try:
        result = int(
            redis_client.eval(
                _RESERVE_PROVIDER_CALL,
                4,
                total_key,
                provider_key,
                token_key,
                details_key,
                settings.AI_DAILY_PROVIDER_CALL_LIMIT,
                settings.AI_DAILY_ESTIMATED_TOKEN_LIMIT,
                reserved_tokens,
                expires_at,
                attempt_field,
                token_field,
            )
        )
    except RedisError as error:
        raise AIUsageUnavailable(
            "AI usage controls are unavailable. Please try again later."
        ) from error

    if result == -1:
        raise AIQuotaExceeded(
            "The daily AI request budget has been reached. Please try again tomorrow."
        )
    if result == -2:
        raise AIQuotaExceeded(
            "The daily estimated AI token budget has been reached. Please try again tomorrow."
        )
    if result <= 0:
        raise AIUsageUnavailable(
            "AI usage controls rejected this request. Please try again later."
        )
    return result


def record_provider_outcome(
    provider_name: str,
    model_name: str,
    feature: str,
    outcome: str,
    *,
    reserved_tokens: int,
    actual_tokens: int | None = None,
) -> None:
    if outcome not in {"successes", "failures"}:
        raise ValueError("Invalid AI provider outcome.")

    total_key, _provider_prefix, expires_at, _date = _usage_keys()
    token_key = total_key.replace(":total", ":estimated_tokens")
    details_key = total_key.replace(":total", ":details")
    outcome_field = _dimension_field(provider_name, model_name, feature, outcome)
    token_field = _dimension_field(
        provider_name,
        model_name,
        feature,
        "estimated_tokens",
    )
    try:
        redis_client.eval(
            _RECORD_OUTCOME,
            2,
            details_key,
            token_key,
            outcome_field,
            reserved_tokens,
            actual_tokens if actual_tokens is not None else -1,
            expires_at,
            token_field,
        )
    except RedisError as error:
        logger.exception(
            "Could not record AI provider outcome (%s, %s, %s).",
            provider_name,
            model_name,
            feature,
        )
        raise AIUsageUnavailable(
            "AI usage reporting is unavailable. Please try again later."
        ) from error


def record_cache_hit(provider_name: str, model_name: str, feature: str) -> None:
    total_key, _provider_prefix, expires_at, _date = _usage_keys()
    details_key = total_key.replace(":total", ":details")
    field = _dimension_field(provider_name, model_name, feature, "cache_hits")
    try:
        redis_client.eval(
            _RECORD_CACHE_HIT,
            1,
            details_key,
            field,
            expires_at,
        )
    except RedisError as error:
        logger.warning(
            "Could not record AI cache-hit metric (%s, %s, %s): %s.",
            provider_name,
            model_name,
            feature,
            type(error).__name__,
        )


def get_ai_usage() -> dict[str, Any]:
    total_key, provider_prefix, _expires_at, usage_date = _usage_keys()
    token_key = total_key.replace(":total", ":estimated_tokens")
    details_key = total_key.replace(":total", ":details")
    providers = ("groq", "gemini")
    try:
        total = int(redis_client.get(total_key) or 0)
        estimated_tokens = int(redis_client.get(token_key) or 0)
        provider_calls = {
            provider: int(redis_client.get(f"{provider_prefix}{provider}") or 0)
            for provider in providers
        }
        raw_details = redis_client.hgetall(details_key)
    except (RedisError, TypeError, ValueError) as error:
        raise AIUsageUnavailable(
            "AI usage metrics are unavailable. Please try again later."
        ) from error

    dimensions: dict[tuple[str, str, str], dict[str, int | str]] = {}
    try:
        for raw_field, raw_count in raw_details.items():
            provider, model, feature, metric = json.loads(raw_field)
            entry = dimensions.setdefault(
                (provider, model, feature),
                {
                    "provider": provider,
                    "model": model,
                    "feature": feature,
                    "attempts": 0,
                    "successes": 0,
                    "failures": 0,
                    "cache_hits": 0,
                    "estimated_tokens": 0,
                },
            )
            if metric in {"attempts", "successes", "failures", "cache_hits", "estimated_tokens"}:
                entry[metric] = int(raw_count)
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        raise AIUsageUnavailable(
            "AI usage metrics contain invalid data. Please try again later."
        ) from error

    request_limit = settings.AI_DAILY_PROVIDER_CALL_LIMIT
    token_limit = settings.AI_DAILY_ESTIMATED_TOKEN_LIMIT
    return {
        "date": usage_date,
        "daily_limit": request_limit,
        "total_requests": total,
        "remaining_requests": max(0, request_limit - total),
        "provider_requests": provider_calls,
        "estimated_token_limit": token_limit,
        "estimated_tokens_used": estimated_tokens,
        "estimated_tokens_remaining": max(0, token_limit - estimated_tokens),
        "details": list(dimensions.values()),
    }
