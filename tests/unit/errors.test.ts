import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import {
  appError,
  unauthenticated,
  forbidden,
  notFound,
  conflict,
  invalidInput,
  tokenInvalid,
  rateLimited,
  aiError,
  internal,
  HTTP_STATUS,
} from "../../convex/lib/errors";
import type { ErrorCode, AppErrorData } from "../../convex/lib/errors";

/**
 * WOR-98: ConvexError wrapper and error codes tests
 *
 * Pure unit tests — no Convex runtime or convex-test needed.
 * At red state the import from convex/lib/errors.ts produces TS2307
 * because the module has not been created yet.
 */

// ── Canonical mapping from TechSpec §7.4 ────────────────────────────────

const EXPECTED_STATUS: Record<string, number> = {
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

const NAMED_CONSTRUCTORS: Record<
  string,
  (message: string) => ConvexError<AppErrorData>
> = {
  UNAUTHENTICATED: unauthenticated,
  FORBIDDEN: forbidden,
  NOT_FOUND: notFound,
  CONFLICT: conflict,
  INVALID_INPUT: invalidInput,
  TOKEN_INVALID: tokenInvalid,
  RATE_LIMITED: rateLimited,
  AI_ERROR: aiError,
  INTERNAL: internal,
};

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

// ── AC1: Module exports typed error constructors for all 9 codes ────────

describe("AC1 — named constructors for all 9 codes", () => {
  it.each(ALL_CODES)(
    "%s constructor returns ConvexError with correct code and httpStatus",
    (code) => {
      const msg = `test message for ${code}`;
      const err = NAMED_CONSTRUCTORS[code](msg);

      expect(err).toBeInstanceOf(ConvexError);
      expect(err.data.code).toBe(code);
      expect(err.data.message).toBe(msg);
      expect(err.data.httpStatus).toBe(EXPECTED_STATUS[code]);
    },
  );
});

// ── AC2: Each constructor takes message and returns correct code/httpStatus ──

describe("AC2 — appError produces same result as named constructors", () => {
  it.each(ALL_CODES)(
    "appError('%s', msg) matches the named constructor",
    (code) => {
      const msg = `equivalence test for ${code}`;
      const fromApp = appError(code, msg);
      const fromNamed = NAMED_CONSTRUCTORS[code](msg);

      expect(fromApp).toBeInstanceOf(ConvexError);
      expect(fromApp.data).toStrictEqual(fromNamed.data);
    },
  );

  it("each code maps to the TechSpec §7.4 httpStatus", () => {
    for (const code of ALL_CODES) {
      const err = appError(code, "status check");
      expect(err.data.httpStatus).toBe(EXPECTED_STATUS[code]);
    }
  });
});

// ── AC3: Vitest unit tests verify each constructor produces expected shape ──

describe("AC3 — error shape consistency", () => {
  it.each(ALL_CODES)(
    "%s constructor returns exactly { code, message, httpStatus }",
    (code) => {
      const err = NAMED_CONSTRUCTORS[code]("shape test");
      const keys = Object.keys(err.data).sort();
      expect(keys).toStrictEqual(["code", "httpStatus", "message"]);
    },
  );

  it.each(ALL_CODES)(
    "appError('%s', msg) returns exactly { code, message, httpStatus }",
    (code) => {
      const err = appError(code, "shape test via appError");
      const keys = Object.keys(err.data).sort();
      expect(keys).toStrictEqual(["code", "httpStatus", "message"]);
    },
  );
});

// ── HTTP_STATUS export matches TechSpec §7.4 ────────────────────────────

describe("HTTP_STATUS record", () => {
  it("contains all 9 codes with correct httpStatus values", () => {
    for (const code of ALL_CODES) {
      expect(HTTP_STATUS[code]).toBe(EXPECTED_STATUS[code]);
    }
  });

  it("contains exactly 9 entries", () => {
    expect(Object.keys(HTTP_STATUS)).toHaveLength(9);
  });
});

// ── Edge case: empty message string ─────────────────────────────────────

describe("edge cases", () => {
  it("accepts an empty string as a valid message", () => {
    const err = appError("INTERNAL", "");
    expect(err.data.message).toBe("");
  });

  it("named constructor accepts an empty string message", () => {
    const err = notFound("");
    expect(err.data.message).toBe("");
    expect(err.data.code).toBe("NOT_FOUND");
    expect(err.data.httpStatus).toBe(404);
  });
});
