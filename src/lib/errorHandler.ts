import { ConvexError } from "convex/values";
import { type ErrorCode, type AppErrorData } from "../../convex/lib/errors";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find what you're looking for.",
  CONFLICT:
    "This action can't be performed right now. The state may have changed.",
  INVALID_INPUT: "Please check your input and try again.",
  TOKEN_INVALID: "This invite link is no longer valid.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  AI_ERROR: "The AI service encountered an issue. Please try again.",
  INTERNAL: "Something went wrong on our end. Please try again.",
};

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

export function handleConvexError(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as AppErrorData;
    if (data && typeof data === "object" && "code" in data) {
      const code = data.code as ErrorCode;
      if (code in ERROR_MESSAGES) {
        return ERROR_MESSAGES[code];
      }
    }
  }
  return GENERIC_MESSAGE;
}
