# Private Coaching API

> Module: `convex/privateCoaching.ts` · Ticket: WOR-117

## Overview

Private coaching is the confidential, AI-guided conversation each party
has before joint mediation. Messages sent during private coaching are
visible **only** to the sender — the other party can never see them.

The module exposes one query and two mutations. An internal action stub
(`generateAIResponse`) is scheduled after each user message; the actual AI
implementation ships in a separate ticket.

## Queries

### `privateCoaching/myMessages`

Returns the caller's private messages for a case, sorted by `createdAt`
ascending. If the caller has no messages (or is not a party to the case),
an empty array is returned — no error is thrown, to avoid leaking
information about message existence.

| Argument | Type        | Description            |
|----------|-------------|------------------------|
| `caseId` | `Id<"cases">` | The case to query    |

**Privacy:** Uses the `by_case_and_user` index on `privateMessages` to
filter at the database level. The `by_case` index (which includes all
parties' messages) is reserved for server-side AI context assembly and is
never exposed through a client-facing query.

## Mutations

### `privateCoaching/sendUserMessage`

Inserts a private message with `role=USER` and `status=COMPLETE`, then
schedules the `generateAIResponse` internal action.

| Argument  | Type           | Description                  |
|-----------|----------------|------------------------------|
| `caseId`  | `Id<"cases">`  | The case to send a message in |
| `content` | `string`       | The message text             |

**Status guard:** The case must be in `DRAFT_PRIVATE_COACHING` or
`BOTH_PRIVATE_COACHING` status. If not, a `CONFLICT` error (HTTP 409) is
thrown.

### `privateCoaching/markComplete`

Sets the caller's `privateCoachingCompletedAt` timestamp on their
`partyStates` row. When both parties have completed, the
`synthesis/generate` action is automatically scheduled.

| Argument | Type           | Description                       |
|----------|----------------|-----------------------------------|
| `caseId` | `Id<"cases">`  | The case to mark coaching complete |

Returns `{ synthesisScheduled: boolean }`.

**Idempotency:** Calling `markComplete` a second time is a no-op — it
will not re-trigger synthesis.

## Authentication

All functions require authentication via `requireAuth`. `sendUserMessage`
and `markComplete` additionally verify the caller is a party to the case
via `requirePartyToCase`.
