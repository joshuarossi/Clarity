# Case Lifecycle State Machine

The case lifecycle state machine (`convex/lib/stateMachine.ts`) is the
single enforcement point for all status transitions in Clarity's
mediation flow. Every mutation that changes a case's status must call
`validateTransition` — it either returns the new status or throws a
`ConvexError` with code `CONFLICT`.

## Statuses

| Status                   | Phase                 |
| ------------------------ | --------------------- |
| `DRAFT_PRIVATE_COACHING` | Initiator coaching    |
| `BOTH_PRIVATE_COACHING`  | Both parties coaching |
| `READY_FOR_JOINT`        | Coaching complete     |
| `JOINT_ACTIVE`           | Joint session         |
| `CLOSED_RESOLVED`        | Terminal — resolved   |
| `CLOSED_UNRESOLVED`      | Terminal — unresolved |
| `CLOSED_ABANDONED`       | Terminal — abandoned  |

## Transitions

```
DRAFT_PRIVATE_COACHING ──ACCEPT_INVITE──► BOTH_PRIVATE_COACHING
DRAFT_PRIVATE_COACHING ──DECLINE_INVITE─► CLOSED_ABANDONED

BOTH_PRIVATE_COACHING ──COMPLETE_COACHING──► READY_FOR_JOINT

READY_FOR_JOINT ──START_JOINT──► JOINT_ACTIVE

JOINT_ACTIVE ──RESOLVE──────────► CLOSED_RESOLVED
JOINT_ACTIVE ──CLOSE_UNRESOLVED─► CLOSED_UNRESOLVED
JOINT_ACTIVE ──ABANDON──────────► CLOSED_ABANDONED
```

Terminal statuses (`CLOSED_*`) have no outbound transitions.

## Usage

```ts
import { validateTransition } from "../lib/stateMachine";
import type { ClosureContext } from "../lib/stateMachine";

// Basic transition
const newStatus = validateTransition(case_.status, "ACCEPT_INVITE");

// Closure requires context proving both parties confirmed
const ctx: ClosureContext = {
  partyStates: [
    { closureProposed: true, closureConfirmed: true },
    { closureProposed: true, closureConfirmed: true },
  ],
};
const resolved = validateTransition("JOINT_ACTIVE", "RESOLVE", ctx);
```

## Error handling

Illegal transitions throw a `ConvexError` with the shape:

```json
{
  "code": "CONFLICT",
  "message": "Cannot transition from <status> via <transition> ...",
  "httpStatus": 409
}
```

## RESOLVE preconditions

The `RESOLVE` transition (JOINT_ACTIVE → CLOSED_RESOLVED) is the only
transition that requires a `ClosureContext`. It validates:

1. Context is provided.
2. Exactly 2 party states are present.
3. Both have `closureProposed === true` and `closureConfirmed === true`.

If any condition fails, a CONFLICT error is thrown. This ensures a case
can only be marked resolved when both parties have explicitly agreed to
close it.
