import type { ErrorCode } from "../../convex/lib/errors";
import { ConvexError } from "convex/values";

export type ErrorMessage = { code: string; message: string };

const USER_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to perform this action.",
  NOT_FOUND: "The requested resource could not be found.",
  CONFLICT:
    "This action conflicts with the current state. Please refresh and try again.",
  INVALID_INPUT:
    "The provided input is invalid. Please check your entries and try again.",
  TOKEN_INVALID: "This link is no longer valid. Please request a new one.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  AI_ERROR:
    "The AI service is temporarily unavailable. Please try again shortly.",
  INTERNAL: "Something went wrong. Please try again.",
};

/**
 * Maps a ConvexError to a user-friendly message.
 *
 * This function intentionally discards the original error context to prevent
 * leaking internal details to the UI. Callers should log the original error
 * before calling this function if error context needs to be preserved for
 * debugging.
 */
export function handleConvexError(error: unknown): ErrorMessage {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string };
    if (data && typeof data.code === "string" && data.code in USER_MESSAGES) {
      const code = data.code as ErrorCode;
      return { code, message: USER_MESSAGES[code] };
    }
  }
  return {
    code: "INTERNAL",
    message: "Something went wrong. Please try again.",
  };
}
