---
task_id: WOR-97
ticket_summary: "Auth identity helper and authorization utilities (convex/lib/auth.ts)"
ac_refs:
  - "requireAuth(ctx) returns the authenticated user record or throws UNAUTHENTICATED error"
  - "getUserByEmail(ctx, email) upserts a users row on first login (role defaults to USER) and returns the user record"
  - "requirePartyToCase(ctx, caseId, userId) verifies the user is either initiatorUserId or inviteeUserId on the case, or throws FORBIDDEN"
  - "requireAdmin(ctx) verifies user.role === 'ADMIN' server-side, or throws FORBIDDEN"
  - "Vitest unit tests verify each helper throws the correct error code on unauthorized access"
  - "No query or mutation can bypass auth by importing the table directly — all access goes through these helpers"
files:
  - path: convex/lib/auth.ts
    role: helper
    action: create
    exports:
      - "requireAuth — async helper that authenticates the caller and returns their user doc"
      - "getUserByEmail — async helper that upserts a users row keyed by email and returns the user doc"
      - "requirePartyToCase — async helper that verifies the user is a party to the case or throws FORBIDDEN"
      - "requireAdmin — async helper that authenticates the caller and verifies ADMIN role or throws FORBIDDEN"
  - path: tests/unit/auth.test.ts
    role: test-infrastructure
    action: create
    exports: []
signatures:
  - |
    function requireAuth(
      ctx: { auth: Auth; db: GenericDatabaseReader<DataModel> }
    ): Promise<Doc<"users">>;
  - |
    function getUserByEmail(
      ctx: { db: GenericDatabaseWriter<DataModel> },
      email: string
    ): Promise<Doc<"users">>;
  - |
    function requirePartyToCase(
      ctx: { db: GenericDatabaseReader<DataModel> },
      caseId: Id<"cases">,
      userId: Id<"users">
    ): Promise<Doc<"cases">>;
  - |
    function requireAdmin(
      ctx: { auth: Auth; db: GenericDatabaseReader<DataModel> }
    ): Promise<Doc<"users">>;
queries_used: []
invariants:
  - "requireAuth throws ConvexError with code UNAUTHENTICATED (httpStatus 401) when ctx.auth.getUserIdentity() returns null"
  - "requireAuth throws ConvexError with code UNAUTHENTICATED (httpStatus 401) when no users row matches the identity's email"
  - "getUserByEmail creates a new users row with role USER on first call for a given email; returns the existing row on subsequent calls without modification"
  - "getUserByEmail uses the by_email index on the users table — never a full table scan"
  - "requirePartyToCase throws ConvexError with code FORBIDDEN (httpStatus 403) when the userId is neither initiatorUserId nor inviteeUserId on the case"
  - "requirePartyToCase throws ConvexError with code NOT_FOUND (httpStatus 404) when the caseId does not exist"
  - "requireAdmin throws ConvexError with code FORBIDDEN (httpStatus 403) when the authenticated user's role is not ADMIN"
  - "Error shapes follow TechSpec §7.4: ConvexError with { code, message, httpStatus }"
  - "All helpers are async functions — they await ctx.auth and ctx.db calls"
non_goals:
  - "No Convex function definitions (query, mutation, action) — this is a helper module imported by functions defined in other tasks"
  - "No admin self-promotion — admin role is set manually in v1 (TechSpec §4.2)"
  - "No session management, token refresh, or cookie handling — Convex Auth owns that layer"
  - "No frontend auth components — this module is server-side only"
  - "No dependency on convex/lib/errors.ts (T4) — errors are constructed directly as ConvexError; compatible with T4's appError helper when it lands"
tested_by:
  - ac: "requireAuth(ctx) returns the authenticated user record or throws UNAUTHENTICATED error"
    layer: unit
    file: tests/unit/auth.test.ts
  - ac: "getUserByEmail(ctx, email) upserts a users row on first login (role defaults to USER) and returns the user record"
    layer: unit
    file: tests/unit/auth.test.ts
  - ac: "requirePartyToCase(ctx, caseId, userId) verifies the user is either initiatorUserId or inviteeUserId on the case, or throws FORBIDDEN"
    layer: unit
    file: tests/unit/auth.test.ts
  - ac: "requireAdmin(ctx) verifies user.role === 'ADMIN' server-side, or throws FORBIDDEN"
    layer: unit
    file: tests/unit/auth.test.ts
  - ac: "Vitest unit tests verify each helper throws the correct error code on unauthorized access"
    layer: unit
    file: tests/unit/auth.test.ts
  - ac: "No query or mutation can bypass auth by importing the table directly — all access goes through these helpers"
    layer: unit
    file: tests/unit/auth.test.ts
    reason: "This AC is a design constraint enforced by convention — the test verifies that the helpers exist and work correctly, making them the canonical access path. Enforcement that downstream functions use them is a code-review concern, not a testable assertion."
---

# Contract: WOR-97 — Auth identity helper and authorization utilities (convex/lib/auth.ts)

## Why this work exists

Every Convex function in Clarity begins with an auth check. Without a shared auth module, each query and mutation would inline its own identity lookup, user-row resolution, and role/party verification — leading to inconsistent enforcement, duplicated code, and a high probability that one function forgets a check. This module codifies the TechSpec §4.3 authorization pattern (`getUserIdentity → getUserByEmail → function-specific rule`) once and is imported everywhere. It is the first line of defense for Clarity's privacy guarantees: `requirePartyToCase` is the enforcement point for cross-party data isolation.

## Files and exports

### `convex/lib/auth.ts` (create, helper)

A server-side helper module imported by Convex queries, mutations, and actions. Unlike `convex/lib/stateMachine.ts` (which is pure), this module uses Convex runtime APIs (`ctx.auth`, `ctx.db`) and imports generated types from `convex/_generated/`. It does not define any Convex functions itself — it is a library of async helpers.

The module uses structural typing for its `ctx` parameter rather than importing the full `QueryCtx`/`MutationCtx` types. This allows the same helpers to work in query, mutation, and action contexts. Specifically:

- **`requireAuth(ctx)`** — The primary auth gate. Calls `ctx.auth.getUserIdentity()` to get the OIDC identity. If null, throws UNAUTHENTICATED. Then queries the `users` table by email using the `by_email` index. If no user row exists, throws UNAUTHENTICATED (the user has not completed registration). Returns the `Doc<"users">` on success. This helper is read-only — it never creates or modifies user rows. This is deliberate: `requireAuth` must work in queries (which cannot write), so the user row must already exist by the time any query runs. The upsert happens during the login flow via `getUserByEmail`.

- **`getUserByEmail(ctx, email)`** — The upsert helper used during login/registration mutations. Queries the `users` table by email using the `by_email` index. If a row exists, returns it unchanged. If no row exists, inserts a new row with `role: "USER"`, `displayName` derived from the email (everything before the `@`), and `createdAt: Date.now()`, then returns the newly created row. Requires a writable `ctx.db` (mutation context). This function is idempotent: calling it twice with the same email produces the same result.

- **`requirePartyToCase(ctx, caseId, userId)`** — The party-membership gate. Loads the case by `caseId` using `ctx.db.get()`. If the case does not exist, throws NOT_FOUND. If the `userId` is neither `initiatorUserId` nor `inviteeUserId` on the case, throws FORBIDDEN. Returns the case doc on success. This is read-only and works in both query and mutation contexts. The return value is the case doc, which callers often need anyway (avoiding a redundant second read).

- **`requireAdmin(ctx)`** — Convenience wrapper: calls `requireAuth(ctx)` to get the user doc, then checks `user.role === "ADMIN"`. If not, throws FORBIDDEN. Returns the user doc on success.

The module imports `ConvexError` from `"convex/values"` and constructs errors directly with the `{ code, message, httpStatus }` shape from TechSpec §7.4. When T4 (`convex/lib/errors.ts`) lands, the implementation author may optionally switch to using `appError(code, message)`, but direct construction is acceptable and avoids a dependency on an unimplemented sibling task.

## Data dependencies

This module reads from two tables but does not define any Convex queries/mutations/actions:

- **`users` table** — Read by `requireAuth` (lookup by email via `by_email` index). Written by `getUserByEmail` (insert on first login). Fields consumed: `email`, `role`, `displayName`, `createdAt`.
- **`cases` table** — Read by `requirePartyToCase` (lookup by `_id` via `ctx.db.get()`). Fields consumed: `initiatorUserId`, `inviteeUserId`.

No mutations, actions, or external APIs are called. The module operates entirely within the Convex function context it receives.

## Invariants

**UNAUTHENTICATED means no valid identity or no user row.** `requireAuth` throws UNAUTHENTICATED (httpStatus 401) in two cases: (1) `ctx.auth.getUserIdentity()` returns null (no valid session), and (2) the identity's email has no matching row in the `users` table (user never completed registration). Both cases use the same error code because from the caller's perspective, the user is not authenticated — the distinction is an implementation detail. The error message should differentiate ("No authenticated session" vs. "No user record found for email") for debuggability.

**getUserByEmail is idempotent and uses the by_email index.** The first call with a new email creates a row; the second call returns the existing row. No duplicate rows are created. The `by_email` index on the `users` table (defined in WOR-95 schema) must be used for the lookup — a full table scan is never acceptable. The new user's `role` is always `"USER"` — admin promotion is manual in v1.

**requirePartyToCase is the privacy enforcement point.** Every query that returns party-scoped data (private messages, party states, draft sessions) must call this helper. A bug here is a privacy incident. The check is straightforward: `userId === case.initiatorUserId || userId === case.inviteeUserId`. Note that `inviteeUserId` is optional on the `cases` table (it's `undefined` until the invite is accepted), so a check against an undefined `inviteeUserId` correctly fails for any non-initiator user.

**NOT_FOUND vs FORBIDDEN on requirePartyToCase.** When the case does not exist, the function throws NOT_FOUND (httpStatus 404), not FORBIDDEN. This is a deliberate choice: a non-existent case is not an authorization failure, and returning FORBIDDEN for a missing resource leaks information about whether the resource exists. However, for a case that exists but the user is not a party to, FORBIDDEN (httpStatus 403) is correct.

**Error shape consistency.** All errors use `new ConvexError({ code: string, message: string, httpStatus: number })`. The codes used by this module are: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404). These match TechSpec §7.4.

## Edge cases

**No identity (null from getUserIdentity).** `requireAuth` throws UNAUTHENTICATED immediately without querying the users table. This is the fast path for unauthenticated requests.

**Identity exists but no user row.** This can happen if the auth provider session is valid but the user-upsert mutation hasn't run yet (race condition on very first login). `requireAuth` throws UNAUTHENTICATED. The client should retry after the auth flow completes.

**getUserByEmail concurrent calls.** Two mutations running concurrently for the same email could both see "no row" and both try to insert. Convex mutations are serializable, so one will succeed and the other will be retried by the Convex runtime. The retry will find the existing row and return it. No application-level deduplication is needed.

**requirePartyToCase with undefined inviteeUserId.** Before the invitee accepts, `case.inviteeUserId` is `undefined`. Only the initiator passes the party check. This is correct behavior — the invitee doesn't have access until they accept.

**requireAdmin for a USER-role user.** Throws FORBIDDEN with a message like "Admin access required". The user doc is still returned from `requireAuth` internally, but the FORBIDDEN error prevents access.

## Non-goals

**No Convex function definitions.** This module exports async helper functions, not Convex queries/mutations/actions. Downstream tasks (T9 case CRUD, T17 invite redemption, T25 private coaching, etc.) define the actual functions and import these helpers.

**No admin self-promotion.** There is no `promoteToAdmin` function. In v1, admin role is set manually via the Convex dashboard (TechSpec §4.2).

**No session/token management.** Convex Auth owns session lifecycle. This module only reads the identity from the auth context — it never creates, refreshes, or invalidates sessions.

**No dependency on convex/lib/errors.ts (T4).** Errors are constructed directly as `new ConvexError(...)`. When T4 lands with `appError(code, message)`, either form is acceptable. The error shape is identical either way.

## Test coverage

All tests live in `tests/unit/auth.test.ts` using `convex-test` with the schema from `convex/schema.ts`. Tests define inline Convex functions (using `convexTest` helpers) that call the auth helpers, then assert on results and thrown errors.

**AC 1 (requireAuth returns user or throws UNAUTHENTICATED) → `tests/unit/auth.test.ts` (unit).** Two sub-cases:

1. Happy path: Set up a `convex-test` environment with a seeded user row and a mock identity (via convex-test's identity helpers) matching that user's email. Call `requireAuth(ctx)` inside a test query. Assert: returns a user doc with the correct email.
2. No identity: Run with no identity configured. Assert: throws `ConvexError` with `code: "UNAUTHENTICATED"` and `httpStatus: 401`.
3. Identity but no user row: Set up a mock identity but don't seed a user row. Assert: throws `ConvexError` with `code: "UNAUTHENTICATED"`.

**AC 2 (getUserByEmail upserts on first login) → `tests/unit/auth.test.ts` (unit).** Three sub-cases:

1. First call with new email: Assert returns a user doc with `role: "USER"` and the correct email. Verify via DB query that exactly one users row exists.
2. Second call with same email: Assert returns the same user doc (same `_id`). Verify via DB query that still exactly one users row exists (no duplicate).
3. Different emails: Call with two different emails. Assert two distinct user rows exist.

**AC 3 (requirePartyToCase verifies party membership) → `tests/unit/auth.test.ts` (unit).** Four sub-cases:

1. userId matches initiatorUserId: Assert returns the case doc without throwing.
2. userId matches inviteeUserId: Assert returns the case doc without throwing.
3. userId is neither party: Assert throws `ConvexError` with `code: "FORBIDDEN"` and `httpStatus: 403`.
4. caseId does not exist: Assert throws `ConvexError` with `code: "NOT_FOUND"` and `httpStatus: 404`.

**AC 4 (requireAdmin checks server-side role) → `tests/unit/auth.test.ts` (unit).** Two sub-cases:

1. User with `role: "ADMIN"`: Assert returns the user doc without throwing.
2. User with `role: "USER"`: Assert throws `ConvexError` with `code: "FORBIDDEN"` and `httpStatus: 403`.

**AC 5 (correct error codes on unauthorized access) → covered by ACs 1–4.** Each test above already verifies the error `code` field and `httpStatus`. An additional assertion in each error case verifies that the `message` field is a non-empty string.

**AC 6 (no bypass by importing table directly) → `tests/unit/auth.test.ts` (unit).** This is a design constraint, not a runtime-testable property. The test file verifies that all four helpers exist and function correctly, establishing them as the canonical access path. A brief comment in the test file notes that enforcement of "always use these helpers" is a code-review responsibility — there is no runtime mechanism to prevent a Convex function from querying the users or cases table directly.
