import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_INPUT"
  | "TOKEN_INVALID"
  | "RATE_LIMITED"
  | "AI_ERROR"
  | "INTERNAL";

export type AppErrorData = {
  code: ErrorCode;
  message: string;
  httpStatus: number;
};

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_INPUT: 400,
  TOKEN_INVALID: 400,
  RATE_LIMITED: 429,
  AI_ERROR: 502,
  INTERNAL: 500,
};

export function appError(
  code: ErrorCode,
  message: string,
): ConvexError<AppErrorData> {
  return new ConvexError({ code, message, httpStatus: HTTP_STATUS[code] });
}

export function unauthenticated(message: string): ConvexError<AppErrorData> {
  return appError("UNAUTHENTICATED", message);
}

export function forbidden(message: string): ConvexError<AppErrorData> {
  return appError("FORBIDDEN", message);
}

export function notFound(message: string): ConvexError<AppErrorData> {
  return appError("NOT_FOUND", message);
}

export function conflict(message: string): ConvexError<AppErrorData> {
  return appError("CONFLICT", message);
}

export function invalidInput(message: string): ConvexError<AppErrorData> {
  return appError("INVALID_INPUT", message);
}

export function tokenInvalid(message: string): ConvexError<AppErrorData> {
  return appError("TOKEN_INVALID", message);
}

export function rateLimited(message: string): ConvexError<AppErrorData> {
  return appError("RATE_LIMITED", message);
}

export function aiError(message: string): ConvexError<AppErrorData> {
  return appError("AI_ERROR", message);
}

export function internal(message: string): ConvexError<AppErrorData> {
  return appError("INTERNAL", message);
}
