# Joint Chat API

> Module: `convex/jointChat.ts` · Tickets: WOR-124, WOR-125

## Overview

The joint chat module is the real-time communication backend for the
mediation session where both parties interact with each other and the AI
Coach. It provides reactive queries for the live message feed and the
per-party synthesis, mutations for sending messages and managing session
closure, and an internal action for AI Coach response generation.

All functions require authentication and verify that the caller is a party
to the case (or uses `viewAsRole` in solo/demo mode).

## Queries

### `messages`

Returns all `jointMessages` rows for the given case, sorted by `createdAt`
ascending. The caller must be a party to the case.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` | The case to fetch messages for |
| `viewAsRole` | `"INITIATOR" \| "INVITEE"` (optional) | Solo-mode role selector |

### `mySynthesis`

Returns the caller's `partyState.synthesisText` — the personalised
guidance generated during the synthesis phase. Defined in the
`enterSession` mutation's companion query (see WOR-123).

## Mutations

### `sendUserMessage`

Inserts a `jointMessages` row with `authorType: "USER"` and
`status: "COMPLETE"`, then schedules the `generateCoachResponse` internal
action to produce the AI Coach reply. Throws `CONFLICT` if the case is not
in `JOINT_ACTIVE` status.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` | Target case |
| `content` | `string` | Message text |

### `proposeClosure`

Sets the caller's `partyStates.closureProposed` to `true` and stores the
provided summary on `case.closureSummary`. Only valid in `JOINT_ACTIVE`.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` | Target case |
| `summary` | `string` | Proposed closure summary |

### `confirmClosure`

If the other party has already proposed closure, transitions the case to
`CLOSED_RESOLVED` via the state machine, sets `closedAt`, and marks both
parties as confirmed. Throws `CONFLICT` if the other party has not proposed.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` | Target case |

### `rejectClosure`

Clears the other party's `closureProposed` flag, effectively declining the
proposal without ending the session.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` | Target case |

### `unilateralClose`

Immediately transitions the case to `CLOSED_UNRESOLVED` via the state
machine. Either party can invoke this at any time during `JOINT_ACTIVE`.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` | Target case |

## Internal Actions

### `generateCoachResponse`

Scheduled by `sendUserMessage` after each user message. Implements a two-step
pipeline:

1. **Classification (Haiku)** — Sends the last user message to
   `claude-haiku-4-5-20251001`, which returns one of:
   `INFLAMMATORY`, `PROGRESS`, `QUESTION_TO_COACH`, or `NORMAL_EXCHANGE`.
2. **Generation (Sonnet)** — For non-`NORMAL_EXCHANGE` classifications (or
   when triggered by an @-mention or a 5+ exchange silence timer), Sonnet
   generates a response using a category-specific or baseline template.

The response is streamed: a `jointMessages` row is inserted with
`authorType: "COACH"` and `status: "STREAMING"`, content is batch-updated as
tokens arrive, and the row transitions to `status: "COMPLETE"` on finish.

A **privacy response filter** checks the final output against both parties'
raw private messages before emitting. On rejection the action retries up to
2 times; on third failure a hardcoded fallback message is posted.

Messages classified as `INFLAMMATORY` are flagged with `isIntervention: true`
for distinct UI styling.

| Trigger type | Behaviour |
|--------------|-----------|
| New user message | Haiku gate decides |
| @-mention | Always generates (bypasses gate) |
| Silence timer (5+ exchanges) | Always generates |

## Error Codes

| Code | HTTP | When |
|------|------|------|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Caller is not a party to the case |
| `CONFLICT` | 409 | Case is not in the expected status, or closure precondition not met |

## State Transitions

All status transitions go through `convex/lib/stateMachine.ts`:

- `JOINT_ACTIVE` → `CLOSED_RESOLVED` (via `confirmClosure`, event `RESOLVE`)
- `JOINT_ACTIVE` → `CLOSED_UNRESOLVED` (via `unilateralClose`, event `CLOSE_UNRESOLVED`)
