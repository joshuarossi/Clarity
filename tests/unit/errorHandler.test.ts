import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import { handleConvexError } from "../../src/lib/errorHandler";
import type { ErrorMessage } from "../../src/lib/errorHandler";
import { appError } from "../../convex/lib/errors";
import type { ErrorCode } from "../../convex/lib/errors";

/**
 * WOR-102: Frontend error handler utility — maps ConvexError codes to
 * user-friendly toast messages.
 *
 * At red state, the import from src/lib/errorHandler.ts produces TS2307
 * because the module has not been created yet. That is expected.
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

describe("AC: Frontend error handler maps ConvexError codes to user-friendly messages", () => {
  describe("each of the 9 ErrorCode values returns a user-friendly message", () => {
    it.each(ALL_CODES)(
      "handleConvexError with code %s returns a non-empty user-friendly string",
      (code) => {
        const serverError = appError(code, `internal detail for ${code}`);
        const result: ErrorMessage = handleConvexError(serverError);

        // Must have code and message fields
        expect(result.code).toBe(code);
        expect(typeof result.message).toBe("string");
        expect(result.message.length).toBeGreaterThan(0);

        // Message must NOT be the raw internal detail — it must be curated
        expect(result.message).not.toBe(`internal detail for ${code}`);

        // Message must NOT be the raw error code itself
        expect(result.message).not.toBe(code);
      },
    );
  });

  describe("unknown / malformed errors return generic fallback", () => {
    it("returns generic fallback for a plain Error (not ConvexError)", () => {
      const plainError = new Error("unexpected failure");
      const result: ErrorMessage = handleConvexError(plainError);

      expect(result.code).toBe("INTERNAL");
      expect(result.message).toBe("Something went wrong. Please try again.");
    });

    it("returns generic fallback for a string thrown value", () => {
      const result: ErrorMessage = handleConvexError("some string error");

      expect(result.code).toBe("INTERNAL");
      expect(result.message).toBe("Something went wrong. Please try again.");
    });

    it("returns generic fallback for null", () => {
      const result: ErrorMessage = handleConvexError(null);

      expect(result.code).toBe("INTERNAL");
      expect(result.message).toBe("Something went wrong. Please try again.");
    });

    it("returns generic fallback for undefined", () => {
      const result: ErrorMessage = handleConvexError(undefined);

      expect(result.code).toBe("INTERNAL");
      expect(result.message).toBe("Something went wrong. Please try again.");
    });

    it("returns generic fallback for ConvexError with unrecognized code", () => {
      // Simulate a ConvexError with a code not in the known 9
      const weirdError = new ConvexError({
        code: "UNKNOWN_CODE",
        message: "some server detail",
        httpStatus: 500,
      });
      const result: ErrorMessage = handleConvexError(weirdError);

      expect(result.code).toBe("INTERNAL");
      expect(result.message).toBe("Something went wrong. Please try again.");
    });
  });

  describe("error handler never exposes raw internal messages", () => {
    it.each(ALL_CODES)(
      "handleConvexError with %s does not return the raw server message",
      (code) => {
        const rawMessage = `DB error: table users, row abc123, constraint violation in ${code}`;
        const serverError = appError(code, rawMessage);
        const result: ErrorMessage = handleConvexError(serverError);

        // The user-facing message must not contain the raw internal detail
        expect(result.message).not.toContain("DB error");
        expect(result.message).not.toContain("abc123");
        expect(result.message).not.toContain("constraint violation");
      },
    );
  });

  describe("return type shape", () => {
    it("returns an object with exactly code and message fields", () => {
      const serverError = appError("NOT_FOUND", "resource missing");
      const result: ErrorMessage = handleConvexError(serverError);

      const keys = Object.keys(result).sort();
      expect(keys).toStrictEqual(["code", "message"]);
    });

    it("fallback also returns exactly code and message fields", () => {
      const result: ErrorMessage = handleConvexError(new Error("boom"));

      const keys = Object.keys(result).sort();
      expect(keys).toStrictEqual(["code", "message"]);
    });
  });
});
