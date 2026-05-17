# Joint Chat API

> Module: `convex/jointChat.ts` · Tickets: WOR-124, WOR-125, WOR-144, WOR-145, WOR-146

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

### `enterSession`

Transitions the case from `READY_FOR_JOINT` to `JOINT_ACTIVE` via the
state machine. On the **first** such transition the mutation schedules
`generateCoachOpeningMessage`, which produces a Coach opening message
grounded in the case's `mainTopic`. The state machine prevents re-entry,
so duplicate opening messages cannot be generated.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` | Target case |
| `viewAsRole` | `"INITIATOR" \| "INVITEE"` (optional) | Solo-mode role selector |

### `sendUserMessage`

Inserts a `jointMessages` row with `authorType: "USER"` and
`status: "COMPLETE"`, then schedules the `generateCoachResponse` internal
action to produce the AI Coach reply. If the message contains an `@Coach`
mention (case-insensitive, word-boundary match via `detectCoachMention`
in `convex/lib/mentionDetect.ts`), `triggerType: "mention"` is passed to
the action so the Coach always responds regardless of Haiku classification.
Throws `CONFLICT` if the case is not in `JOINT_ACTIVE` status.

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

### `generateCoachOpeningMessage`

Scheduled by `enterSession` on the first transition to `JOINT_ACTIVE`.
Generates a contextual opening message where the Coach acts as a neutral
facilitator, grounding the conversation in the case's `mainTopic`. Uses
the same streaming-insert path as `generateCoachResponse` (insert →
stream → finalize) and applies the privacy response filter before
finalizing. On failure after retries the message row is marked `ERROR`.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` | The case entering the joint session |

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
| Periodic summary (cron) | Always generates in summary mode |

### `evaluateAndSummarize`

A periodic internal action invoked by the `"joint session summary evaluation"`
cron every 10 minutes. It queries all `JOINT_ACTIVE` cases (or a single
specified case) and for each checks whether at least 6 user messages have been
sent since the last Coach message. If the threshold is met, it schedules
`generateCoachResponse` with `triggerType: "timer"`, which activates **summary
mode** — appending a dedicated system instruction that asks the Coach to
identify and summarise points of agreement rather than providing general
facilitation.

Throttle mechanism: the 6-message minimum prevents redundant summaries when
conversation is slow or when agreement has not advanced since the last summary.

| Arg | Type | Description |
|-----|------|-------------|
| `caseId` | `Id<"cases">` (optional) | Evaluate a single case; omit to scan all active cases |

## Error Codes

| Code | HTTP | When |
|------|------|------|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Caller is not a party to the case |
| `CONFLICT` | 409 | Case is not in the expected status, or closure precondition not met |

## State Transitions

All status transitions go through `convex/lib/stateMachine.ts`:

- `READY_FOR_JOINT` → `JOINT_ACTIVE` (via `enterSession`, event `START_JOINT`)
- `JOINT_ACTIVE` → `CLOSED_RESOLVED` (via `confirmClosure`, event `RESOLVE`)
- `JOINT_ACTIVE` → `CLOSED_UNRESOLVED` (via `unilateralClose`, event `CLOSE_UNRESOLVED`)
