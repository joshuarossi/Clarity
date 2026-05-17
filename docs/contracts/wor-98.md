---
task_id: WOR-98
ticket_summary: "ConvexError wrapper and error codes (convex/lib/errors.ts)"
ac_refs:
  - "Module exports typed error constructors for all 9 codes: UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, INVALID_INPUT, TOKEN_INVALID, RATE_LIMITED, AI_ERROR, INTERNAL"
  - "Each error constructor takes a message string and returns a ConvexError with the correct code and httpStatus"
  - "Vitest unit tests verify each constructor produces the expected shape"
files:
  - path: convex/lib/errors.ts
    role: helper
    action: create
    exports:
      - "ErrorCode — string literal union type of the 9 error codes"
      - "AppErrorData — type alias for the { code: ErrorCode; message: string; httpStatus: number } shape"
      - "appError — convenience constructor that takes (code: ErrorCode, message: string) and returns a ConvexError<AppErrorData>"
      - "unauthenticated — constructor (message: string) => ConvexError<AppErrorData> with code UNAUTHENTICATED, httpStatus 401"
      - "forbidden — constructor (message: string) => ConvexError<AppErrorData> with code FORBIDDEN, httpStatus 403"
      - "notFound — constructor (message: string) => ConvexError<AppErrorData> with code NOT_FOUND, httpStatus 404"
      - "conflict — constructor (message: string) => ConvexError<AppErrorData> with code CONFLICT, httpStatus 409"
      - "invalidInput — constructor (message: string) => ConvexError<AppErrorData> with code INVALID_INPUT, httpStatus 400"
      - "tokenInvalid — constructor (message: string) => ConvexError<AppErrorData> with code TOKEN_INVALID, httpStatus 400"
      - "rateLimited — constructor (message: string) => ConvexError<AppErrorData> with code RATE_LIMITED, httpStatus 429"
      - "aiError — constructor (message: string) => ConvexError<AppErrorData> with code AI_ERROR, httpStatus 502"
      - "internal — constructor (message: string) => ConvexError<AppErrorData> with code INTERNAL, httpStatus 500"
      - "HTTP_STATUS — Record<ErrorCode, number> mapping each code to its httpStatus"
  - path: tests/unit/errors.test.ts
    role: test-infrastructure
    action: create
    exports: []
signatures:
  - 'type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT" | "TOKEN_INVALID" | "RATE_LIMITED" | "AI_ERROR" | "INTERNAL";'
  - "type AppErrorData = { code: ErrorCode; message: string; httpStatus: number };"
  - "const HTTP_STATUS: Record<ErrorCode, number>;"
  - "function appError(code: ErrorCode, message: string): ConvexError<AppErrorData>;"
  - "function unauthenticated(message: string): ConvexError<AppErrorData>;"
  - "function forbidden(message: string): ConvexError<AppErrorData>;"
  - "function notFound(message: string): ConvexError<AppErrorData>;"
  - "function conflict(message: string): ConvexError<AppErrorData>;"
  - "function invalidInput(message: string): ConvexError<AppErrorData>;"
  - "function tokenInvalid(message: string): ConvexError<AppErrorData>;"
  - "function rateLimited(message: string): ConvexError<AppErrorData>;"
  - "function aiError(message: string): ConvexError<AppErrorData>;"
  - "function internal(message: string): ConvexError<AppErrorData>;"
queries_used: []
invariants:
  - "Every constructor returns a ConvexError whose data is exactly { code, message, httpStatus } — no extra fields, no missing fields"
  - "The httpStatus for each code matches TechSpec §7.4: UNAUTHENTICATED→401, FORBIDDEN→403, NOT_FOUND→404, CONFLICT→409, INVALID_INPUT→400, TOKEN_INVALID→400, RATE_LIMITED→429, AI_ERROR→502, INTERNAL→500"
  - "appError(code, message) produces an identical result to calling the named constructor for that code"
  - "The ErrorCode type is a closed string literal union — only the 9 defined codes are valid"
  - "The module has no runtime dependencies beyond convex/values (ConvexError) — it is a pure utility with no database, auth, or external API calls"
non_goals:
  - "No frontend error handler — mapping error codes to user-friendly messages is deferred to T8 (App shell)"
  - "No retry logic or error recovery — this module only constructs error objects"
  - "No logging or telemetry — callers decide whether to log before throwing"
  - "No modification of existing auth.ts or stateMachine.ts to use these constructors — that is optional refactoring for later tickets"
tested_by:
  - ac: "Module exports typed error constructors for all 9 codes: UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, INVALID_INPUT, TOKEN_INVALID, RATE_LIMITED, AI_ERROR, INTERNAL"
    layer: unit
    file: tests/unit/errors.test.ts
  - ac: "Each error constructor takes a message string and returns a ConvexError with the correct code and httpStatus"
    layer: unit
    file: tests/unit/errors.test.ts
  - ac: "Vitest unit tests verify each constructor produces the expected shape"
    layer: unit
    file: tests/unit/errors.test.ts
---

# Contract: WOR-98 — ConvexError wrapper and error codes (convex/lib/errors.ts)

## Why this work exists

Every Convex function in Clarity needs to throw errors in a consistent shape so the frontend can map error codes to user-friendly messages without parsing raw strings. Today, `convex/lib/auth.ts` and `convex/lib/stateMachine.ts` construct `ConvexError({ code, message, httpStatus })` inline — each call site independently picks the right httpStatus. This module centralizes that mapping into typed constructors, eliminating the possibility of a typo in an error code or a wrong httpStatus number. The error shape `{ code, message, httpStatus }` is defined in TechSpec §7.4.

## Files and exports

### `convex/lib/errors.ts` (create, helper)

A pure utility module with no database, auth, or Convex runtime dependencies. It imports only `ConvexError` from `"convex/values"`. The module exports:

1. **`ErrorCode`** — A string literal union type of the 9 error codes. This is the canonical type that all error-throwing code should use to constrain the `code` field.

2. **`AppErrorData`** — A type alias for `{ code: ErrorCode; message: string; httpStatus: number }`. This is the shape carried inside every `ConvexError` thrown by the application.

3. **`HTTP_STATUS`** — A `Record<ErrorCode, number>` constant mapping each error code to its httpStatus. Exported so that callers or tests can reference the canonical mapping without hardcoding numbers. This is the single source of truth for the code→httpStatus relationship.

4. **`appError(code, message)`** — The primary convenience constructor. Looks up the httpStatus from `HTTP_STATUS[code]` and returns `new ConvexError({ code, message, httpStatus })`. This is the function most call sites will use: `throw appError("UNAUTHENTICATED", "No session")`.

5. **Nine named constructors** — `unauthenticated`, `forbidden`, `notFound`, `conflict`, `invalidInput`, `tokenInvalid`, `rateLimited`, `aiError`, `internal`. Each takes only a `message: string` and delegates to `appError` with the corresponding code. These exist for ergonomics at call sites that always throw the same code (e.g., auth helpers always throw `unauthenticated(...)` or `forbidden(...)`).

The named constructors are implemented as simple wrappers around `appError`. For example: `export function unauthenticated(message: string) { return appError("UNAUTHENTICATED", message); }`. This keeps the httpStatus mapping in one place (`HTTP_STATUS`) rather than scattered across 9 functions.

### `tests/unit/errors.test.ts` (create, test-infrastructure)

Unit tests using Vitest. Since `convex/lib/errors.ts` is a pure module (no Convex runtime, no database), these tests do not need `convex-test` — they are plain Vitest tests that import the module directly and assert on the returned `ConvexError` instances.

## Data dependencies

None. This module is a pure utility — it does not read from or write to any database table, call any Convex query/mutation/action, or make any external API calls.

## Invariants

**Error shape is exactly `{ code, message, httpStatus }`.** Every constructor returns a `ConvexError` whose `.data` property is an object with exactly three fields: `code` (an `ErrorCode` string), `message` (the string passed to the constructor), and `httpStatus` (a number from `HTTP_STATUS`). No additional fields are added. No fields are omitted.

**httpStatus mapping matches TechSpec §7.4.** The mapping is:

- `UNAUTHENTICATED` → 401
- `FORBIDDEN` → 403
- `NOT_FOUND` → 404
- `CONFLICT` → 409
- `INVALID_INPUT` → 400
- `TOKEN_INVALID` → 400
- `RATE_LIMITED` → 429
- `AI_ERROR` → 502
- `INTERNAL` → 500

Note that `INVALID_INPUT` and `TOKEN_INVALID` share httpStatus 400 — this is intentional per the TechSpec.

**`appError` and named constructors produce identical results.** `appError("FORBIDDEN", "msg")` and `forbidden("msg")` must return structurally identical `ConvexError` instances. The named constructors are syntactic sugar, not an alternative code path.

**`ErrorCode` is a closed union.** Only the 9 defined string literals are valid. Passing any other string to `appError` is a TypeScript compile-time error. This is enforced by the type system, not at runtime.

## Edge cases

**Empty message string.** Constructors accept an empty string `""` as a valid message. The module does not validate message content — that is the caller's responsibility. The resulting `ConvexError` will have `data.message === ""`.

**All returned values are `ConvexError` instances.** Every constructor returns a `ConvexError` (not a plain object, not a subclass). Test assertions should verify `instanceof ConvexError` and check `.data` for the payload shape.

## Non-goals

**No frontend error handler.** Mapping error codes to user-friendly toast messages is deferred to T8 (App shell). This module is strictly the backend error construction layer.

**No retry logic.** The module constructs error objects. It does not catch, retry, or recover from errors. Callers throw the returned `ConvexError`; Convex propagates it to the client.

**No refactoring of existing modules.** `convex/lib/auth.ts` and `convex/lib/stateMachine.ts` currently construct `ConvexError` inline. This ticket does not modify them to use `appError`. That refactoring may happen in later tickets or as an optional improvement — the inline construction and the `appError` construction produce the same shape and are fully compatible.

## Test coverage

All tests live in `tests/unit/errors.test.ts`. Since the module is pure (no Convex runtime needed), tests import directly from `../../convex/lib/errors.ts` and use plain Vitest assertions.

**AC 1 (exports typed constructors for all 9 codes) → `tests/unit/errors.test.ts` (unit).** For each of the 9 error codes, the test calls the corresponding named constructor with a test message and asserts: (1) the result is an instance of `ConvexError`, (2) `result.data.code` equals the expected code string, (3) `result.data.httpStatus` equals the expected number from the mapping, (4) `result.data.message` equals the input message. Additionally, the test calls `appError(code, message)` for each code and asserts the same shape — verifying that the convenience helper and named constructors agree.

**AC 2 (each constructor takes message and returns correct code/httpStatus) → `tests/unit/errors.test.ts` (unit).** Covered by AC 1's per-code assertions. Each test case verifies the full triple `{ code, message, httpStatus }`.

**AC 3 (Vitest unit tests verify expected shape) → `tests/unit/errors.test.ts` (unit).** An additional test iterates over all 9 codes and asserts that `Object.keys(result.data).sort()` equals `["code", "httpStatus", "message"]` — verifying no extra fields and no missing fields. This is the "shape consistency" check called out in the Test-Gen Brief.
