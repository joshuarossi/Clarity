---
task_id: WOR-96
ticket_summary: "Case lifecycle state machine helper (convex/lib/stateMachine.ts)"
ac_refs:
  - "Module exports a validateTransition function that takes current status + requested transition and returns the new status or throws CONFLICT"
  - "All 7 transitions are implemented: the 6 from TechSpec §5.1 (DRAFT_PRIVATE_COACHING → BOTH_PRIVATE_COACHING, BOTH_PRIVATE_COACHING → READY_FOR_JOINT, READY_FOR_JOINT → JOINT_ACTIVE, JOINT_ACTIVE → CLOSED_RESOLVED, JOINT_ACTIVE → CLOSED_UNRESOLVED, JOINT_ACTIVE → CLOSED_ABANDONED) plus DRAFT_PRIVATE_COACHING → CLOSED_ABANDONED (invite decline per DesignDoc §4.3)"
  - "Illegal transitions throw ConvexError with code CONFLICT and a descriptive message naming both the current state and the attempted transition"
  - "Vitest unit tests cover every legal transition and at least 5 illegal transitions (e.g., DRAFT_PRIVATE_COACHING → JOINT_ACTIVE, CLOSED_RESOLVED → anything)"
  - "Closure transition (JOINT_ACTIVE → CLOSED_RESOLVED) requires both partyStates to have closureProposed=true and closureConfirmed=true"
files:
  - path: convex/lib/stateMachine.ts
    role: helper
    action: create
    exports:
      - "CaseStatus — union type of the 7 case status string literals"
      - "Transition — union type of the 7 transition name string literals"
      - "ClosureContext — interface for the optional closure precondition data"
      - "validateTransition — function that validates and returns the new status or throws"
      - "TRANSITIONS — the transition map constant (exported for test introspection)"
signatures:
  - |
    type CaseStatus =
      | "DRAFT_PRIVATE_COACHING"
      | "BOTH_PRIVATE_COACHING"
      | "READY_FOR_JOINT"
      | "JOINT_ACTIVE"
      | "CLOSED_RESOLVED"
      | "CLOSED_UNRESOLVED"
      | "CLOSED_ABANDONED";
  - |
    type Transition =
      | "ACCEPT_INVITE"
      | "COMPLETE_COACHING"
      | "START_JOINT"
      | "RESOLVE"
      | "CLOSE_UNRESOLVED"
      | "ABANDON"
      | "DECLINE_INVITE";
  - |
    interface ClosureContext {
      partyStates: Array<{
        closureProposed: boolean | undefined;
        closureConfirmed: boolean | undefined;
      }>;
    }
  - |
    function validateTransition(
      currentStatus: CaseStatus,
      transition: Transition,
      context?: ClosureContext
    ): CaseStatus;
  - |
    const TRANSITIONS: Record<string, { from: CaseStatus; to: CaseStatus; transition: Transition }>;
queries_used: []
invariants:
  - "validateTransition is a pure function — no Convex runtime imports, no database access"
  - "Exactly 7 legal transitions exist; all others throw"
  - "RESOLVE transition (JOINT_ACTIVE → CLOSED_RESOLVED) requires context.partyStates to have exactly 2 entries, both with closureProposed=true AND closureConfirmed=true; throws CONFLICT if missing or incomplete"
  - "Errors are thrown as ConvexError with shape { code: 'CONFLICT', message: string, httpStatus: 409 }"
  - "Error messages include both the current status and the attempted transition name"
  - "Terminal statuses (CLOSED_RESOLVED, CLOSED_UNRESOLVED, CLOSED_ABANDONED) have no outbound transitions — any transition from a terminal status throws CONFLICT"
non_goals:
  - "No Convex runtime imports — this is a pure TypeScript module"
  - "No database reads or writes — callers are responsible for loading partyStates and passing them via ClosureContext"
  - "No HTTP status codes beyond the error shape — this is not a route handler"
  - "No transition side-effects (timestamps, audit logging) — calling mutations handle those"
tested_by:
  - ac: "Module exports a validateTransition function that takes current status + requested transition and returns the new status or throws CONFLICT"
    layer: unit
    file: tests/unit/stateMachine.test.ts
  - ac: "All 7 transitions are implemented: the 6 from TechSpec §5.1 plus DRAFT_PRIVATE_COACHING → CLOSED_ABANDONED (invite decline per DesignDoc §4.3)"
    layer: unit
    file: tests/unit/stateMachine.test.ts
  - ac: "Illegal transitions throw ConvexError with code CONFLICT and a descriptive message naming both the current state and the attempted transition"
    layer: unit
    file: tests/unit/stateMachine.test.ts
  - ac: "Vitest unit tests cover every legal transition and at least 5 illegal transitions"
    layer: unit
    file: tests/unit/stateMachine.test.ts
  - ac: "Closure transition (JOINT_ACTIVE → CLOSED_RESOLVED) requires both partyStates to have closureProposed=true and closureConfirmed=true"
    layer: unit
    file: tests/unit/stateMachine.test.ts
---

# Contract: WOR-96 — Case lifecycle state machine helper (convex/lib/stateMachine.ts)

## Why this work exists

Clarity's mediation flow is phase-gated: parties progress through private coaching, synthesis, joint chat, and closure in a strict order. Without a centralized state machine, every mutation that changes case status would inline its own transition logic, making it trivial for bugs to allow illegal state jumps (e.g., skipping private coaching and going straight to the joint session). This module is the single enforcement point — every mutation that transitions case status calls `validateTransition`, and if the transition is illegal, the mutation aborts with a structured CONFLICT error.

## Files and exports

### `convex/lib/stateMachine.ts` (create, helper)

A pure TypeScript module with no Convex runtime dependencies. It exports:

- **`CaseStatus`** — a union type matching the 7 status literals from `convex/schema.ts`. This type is defined locally (not imported from generated types) so the module stays free of Convex runtime coupling. Callers in Convex functions can safely pass `Doc<"cases">["status"]` values — the types are structurally identical.

- **`Transition`** — a union type of 7 named transitions. Each name is a verb phrase describing the action that causes the transition:
  - `ACCEPT_INVITE` — DRAFT_PRIVATE_COACHING → BOTH_PRIVATE_COACHING
  - `COMPLETE_COACHING` — BOTH_PRIVATE_COACHING → READY_FOR_JOINT
  - `START_JOINT` — READY_FOR_JOINT → JOINT_ACTIVE
  - `RESOLVE` — JOINT_ACTIVE → CLOSED_RESOLVED
  - `CLOSE_UNRESOLVED` — JOINT_ACTIVE → CLOSED_UNRESOLVED
  - `ABANDON` — JOINT_ACTIVE → CLOSED_ABANDONED
  - `DECLINE_INVITE` — DRAFT_PRIVATE_COACHING → CLOSED_ABANDONED

- **`ClosureContext`** — an interface carrying the partyStates data needed for the RESOLVE transition's precondition check. The caller is responsible for loading the two partyState records from the database and passing them in. The state machine does not access the database.

- **`validateTransition(currentStatus, transition, context?)`** — the core function. Looks up `(currentStatus, transition)` in the transition map. If the pair is legal, returns the new `CaseStatus`. If not, throws a `ConvexError` with code `CONFLICT`. For the `RESOLVE` transition specifically, it also validates that `context.partyStates` contains exactly 2 entries, both with `closureProposed === true` and `closureConfirmed === true`.

- **`TRANSITIONS`** — the transition map constant, exported so tests can introspect the full set of legal transitions without hardcoding them. Keyed by transition name, each entry specifies `from`, `to`, and `transition`.

The module imports `ConvexError` from `"convex/values"` (a lightweight import that does not pull in the Convex runtime — it is a plain class definition used for error typing).

## Data dependencies

None. This module is a pure function operating on string status values and an optional context object. It does not call any Convex queries, mutations, or actions. Calling mutations are responsible for loading the case document and (for closure) the partyStates before invoking `validateTransition`.

## Invariants

**Pure function, no Convex runtime.** The module imports only `ConvexError` from `"convex/values"`. It does not import from `"convex/server"`, `"./_generated/"`, or any other Convex runtime path. This keeps it unit-testable with plain Vitest — no `convex-test` needed.

**Exactly 7 legal transitions.** The transition map contains exactly 7 entries. Any `(currentStatus, transition)` pair not in the map is illegal. The implementation must not add implicit transitions (e.g., no "auto-advance" from READY_FOR_JOINT on first message).

**Terminal statuses are absorbing.** CLOSED_RESOLVED, CLOSED_UNRESOLVED, and CLOSED_ABANDONED have no outbound transitions. Any attempt to transition from a terminal status throws CONFLICT. This is a consequence of those statuses not appearing as a `from` value in any transition entry.

**RESOLVE requires full closure confirmation.** The RESOLVE transition (JOINT_ACTIVE → CLOSED_RESOLVED) is the only transition that requires `context`. It validates:

1. `context` is provided (throws CONFLICT if missing).
2. `context.partyStates` has exactly 2 entries.
3. Both entries have `closureProposed === true`.
4. Both entries have `closureConfirmed === true`.
   If any condition fails, it throws CONFLICT with a message describing which precondition failed (e.g., "Cannot resolve: not all parties have confirmed closure").

**Error shape matches TechSpec §7.4.** Errors are thrown as `new ConvexError({ code: "CONFLICT", message: "...", httpStatus: 409 })`. The message is human-readable and names both the current status and the attempted transition (e.g., `"Cannot transition from DRAFT_PRIVATE_COACHING via START_JOINT — transition is not allowed from this state"`). This error shape is compatible with the `convex/lib/errors.ts` helper from task T4, but this module constructs the error directly since T4 may not yet be implemented when this module ships (they are sibling tasks, both depending only on T1).

## Edge cases

**Missing context on RESOLVE.** If a caller attempts the RESOLVE transition without providing `context`, the function throws CONFLICT with a message indicating that closure context is required. This prevents accidental closure without verifying partyStates.

**Partial closure confirmation.** If one party has `closureProposed=true, closureConfirmed=true` but the other has `closureProposed=true, closureConfirmed=false` (or `undefined`), the RESOLVE transition throws. The error message should indicate that both parties must confirm.

**DECLINE_INVITE from DRAFT_PRIVATE_COACHING.** This is the 7th transition, added beyond TechSpec §5.1 to support the invite decline flow (DesignDoc §4.3). It transitions to CLOSED_ABANDONED, the same terminal status as the 30-day inactivity auto-close. No special preconditions — if the case is in DRAFT_PRIVATE_COACHING, the invited party can decline.

**Same transition name, wrong source status.** For example, calling `validateTransition("BOTH_PRIVATE_COACHING", "DECLINE_INVITE")` is illegal because DECLINE_INVITE only applies from DRAFT_PRIVATE_COACHING. The error message should name both the current status and the transition.

**Context provided for non-RESOLVE transitions.** If `context` is passed for a transition other than RESOLVE, it is ignored. The function does not throw — extra context is harmless.

## Non-goals

**No Convex runtime integration.** This module does not define queries, mutations, or actions. It is a pure helper imported by mutations defined in other tasks (e.g., T17 invite redemption, T30 joint chat closure, T42 abandonment cron).

**No side-effects.** The module does not update timestamps (`updatedAt`, `closedAt`), write audit log entries, or trigger notifications. Those responsibilities belong to the calling mutation.

**No error helper dependency.** Although task T4 defines `convex/lib/errors.ts` with an `appError` helper, this module constructs `ConvexError` directly to avoid a circular dependency risk and because both T2 and T4 depend only on T1. If T4 lands first, the implementation author may optionally use `appError("CONFLICT", message)` instead of `new ConvexError(...)`, but both are acceptable as long as the error shape matches.

## Test coverage

**AC 1 (validateTransition interface) → `tests/unit/stateMachine.test.ts` (unit).** Call `validateTransition("DRAFT_PRIVATE_COACHING", "ACCEPT_INVITE")` and assert the return value is `"BOTH_PRIVATE_COACHING"`. This validates the basic function signature: takes two strings, returns a string.

**AC 2 (all 7 legal transitions) → `tests/unit/stateMachine.test.ts` (unit).** Parameterized test (`test.each` or equivalent) with a tuple array of all 7 `[currentStatus, transition, expectedNewStatus]` entries. The RESOLVE case must also provide valid `ClosureContext`. Each call asserts the returned status matches the expected value and does not throw.

**AC 3 (illegal transitions throw CONFLICT) → `tests/unit/stateMachine.test.ts` (unit).** Parameterized test with at least 5 illegal `[currentStatus, transition]` pairs:

1. `DRAFT_PRIVATE_COACHING` + `START_JOINT` (skipping phases)
2. `CLOSED_RESOLVED` + `ACCEPT_INVITE` (transition from terminal)
3. `READY_FOR_JOINT` + `DECLINE_INVITE` (wrong source for this transition)
4. `CLOSED_ABANDONED` + `RESOLVE` (transition from terminal)
5. `BOTH_PRIVATE_COACHING` + `RESOLVE` (wrong source for RESOLVE)

Each call asserts: throws, the thrown value is a `ConvexError`, the error's data has `code === "CONFLICT"`, and the message string contains both the current status and the transition name.

**AC 4 (test coverage completeness) → covered by AC 2 + AC 3 parameterized tests.** No additional test file needed.

**AC 5 (closure precondition) → `tests/unit/stateMachine.test.ts` (unit).** Three sub-cases:

1. Call RESOLVE with no context → throws CONFLICT.
2. Call RESOLVE with context where one party has `closureConfirmed: false` → throws CONFLICT.
3. Call RESOLVE with context where both parties have `closureProposed: true, closureConfirmed: true` → returns `"CLOSED_RESOLVED"`.
