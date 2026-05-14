import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import type { ErrorCode, AppErrorData } from "../../convex/lib/errors";
import {
  handleConvexError,
  ERROR_MESSAGES,
} from "../../src/lib/errorHandler";

/**
 * WOR-102: Frontend error handler utility tests
 *
 * AC: Frontend error handler utility maps ConvexError codes
 * (UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, etc.) to
 * user-friendly toast messages.
 *
 * At red state, the import from src/lib/errorHandler.ts produces TS2307
 * because the module has not been created yet.
 */

const ALL_CODES: ErrorCode[] = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_INPUT",
  "TOKEN_INVALID",
  "RATE_LIMITED",
  "AI_ERROR",
  "INTERNAL",
];

/**
 * Helper to construct a ConvexError with the AppErrorData shape,
 * mimicking what the backend appError() produces.
 */
function makeConvexError(code: ErrorCode, message: string): ConvexError<AppErrorData> {
  return new ConvexError<AppErrorData>({
    code,
    message,
    httpStatus: 500, // httpStatus value is irrelevant for handler tests
  });
}

// ── AC: ERROR_MESSAGES record covers all 9 codes ──────────────────────

describe("ERROR_MESSAGES record", () => {
  it("contains exactly 9 entries", () => {
    expect(Object.keys(ERROR_MESSAGES)).toHaveLength(9);
  });

  it.each(ALL_CODES)(
    "has an entry for %s",
    (code) => {
      expect(ERROR_MESSAGES[code]).toBeDefined();
      expect(typeof ERROR_MESSAGES[code]).toBe("string");
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    },
  );

  it.each(ALL_CODES)(
    "message for %s is user-friendly (does not contain the raw error code)",
    (code) => {
      const message = ERROR_MESSAGES[code];
      // User-friendly messages should not contain the raw uppercase code
      expect(message).not.toContain(code);
    },
  );
});

// ── AC: handleConvexError maps each code to its user-friendly message ─

describe("handleConvexError with ConvexError inputs", () => {
  it.each(ALL_CODES)(
    "returns the correct user-friendly message for %s",
    (code) => {
      const error = makeConvexError(code, "server-side detail");
      const result = handleConvexError(error);
      expect(result).toBe(ERROR_MESSAGES[code]);
    },
  );

  it.each(ALL_CODES)(
    "returned message for %s is a non-empty string",
    (code) => {
      const error = makeConvexError(code, "detail");
      const result = handleConvexError(error);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    },
  );
});

// ── AC: Fallback for unknown/non-ConvexError errors ───────────────────

describe("handleConvexError fallback behavior", () => {
  it("returns a generic fallback for a plain Error", () => {
    const error = new Error("network failure");
    const result = handleConvexError(error);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // The fallback should not expose the raw error message
    expect(result).not.toContain("network failure");
  });

  it("returns a generic fallback for a non-Error value", () => {
    const result = handleConvexError("unexpected string error");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a generic fallback for null", () => {
    const result = handleConvexError(null);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a generic fallback for undefined", () => {
    const result = handleConvexError(undefined);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a generic fallback for a ConvexError with unrecognized data shape", () => {
    const error = new ConvexError("plain string data");
    const result = handleConvexError(error);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
