import ipaddress
import re
from urllib.parse import urlsplit


LOCAL_IMAGE_PATH_PATTERN = re.compile(r"^/static/products/[A-Za-z0-9_-][A-Za-z0-9._-]*$")
BLOCKED_HOST_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".lan",
    ".test",
    ".invalid",
    ".example",
)
NUMERIC_HOST_PATTERN = re.compile(
    r"^(?:0x[0-9a-f]+|[0-9]+)(?:\.(?:0x[0-9a-f]+|[0-9]+))*$"
)


def normalize_product_image_url(value: str | None) -> str | None:
    if value is None:
        return None

    image_url = value.strip()
    if not image_url:
        return None
    if len(image_url) > 500:
        raise ValueError("Image URL must be at most 500 characters.")
    if LOCAL_IMAGE_PATH_PATTERN.fullmatch(image_url):
        return image_url
    if any(character.isspace() or ord(character) < 32 for character in image_url):
        raise ValueError("Image URL must not contain whitespace or control characters.")

    try:
        parsed = urlsplit(image_url)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError as error:
        raise ValueError("Enter a valid public HTTPS image URL.") from error

    if (
        parsed.scheme.lower() != "https"
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or (port is not None and port != 443)
    ):
        raise ValueError("Image URL must be a public HTTPS URL without credentials.")

    normalized_host = hostname.rstrip(".").lower()
    if (
        normalized_host == "localhost"
        or normalized_host.endswith(BLOCKED_HOST_SUFFIXES)
        or NUMERIC_HOST_PATTERN.fullmatch(normalized_host)
    ):
        raise ValueError("Image URL must use a public hostname.")
    try:
        ipaddress.ip_address(normalized_host)
    except ValueError:
        pass
    else:
        raise ValueError("Image URL must use a public hostname, not an IP address.")

    return image_url
