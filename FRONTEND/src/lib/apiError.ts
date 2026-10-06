import { isAxiosError } from "axios";
import type { ApiErrorResponse } from "../types";

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorResponse>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }

  return fallback;
}
