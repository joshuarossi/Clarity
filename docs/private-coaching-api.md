# Private Coaching API

> Module: `convex/privateCoaching.ts` · Tickets: WOR-117, WOR-118, WOR-119, WOR-120

## Overview

Private coaching is the confidential, AI-guided conversation each party
has before joint mediation. Messages sent during private coaching are
visible **only** to the sender — the other party can never see them.

The module exposes one query, three client-facing mutations, and an internal
action (`generateAIResponse`) that streams AI responses back to the
database in real time.

## Frontend — PrivateCoachingView

> Component: `src/routes/CasePrivatePage.tsx` · Route: `/cases/:caseId/private`

The PrivateCoachingView is the full-screen chat page where each party
holds a private conversation with the AI coach. Key features:

- **Privacy banner** — a persistent top banner with a lock icon stating
  the other party will never see the conversation. Clicking the lock
  opens a privacy-details modal.
- **Streaming messages** — AI responses appear with a blinking cursor as
  tokens arrive in real time; a copy button shows only after the message
  is complete.
- **Input** — Enter sends, Shift+Enter inserts a newline. The Send button
  is disabled while the AI is responding, but the textarea stays enabled
  for pre-typing.
- **Mark complete** — a subtle footer CTA opens a confirmation dialog
  showing the message count, then transitions the view to read-only.
- **Error handling** — AI errors render inline with error styling and a
  Retry button.

## Queries

### `privateCoaching/myMessages`

Returns the caller's private messages for a case, sorted by `createdAt`
ascending. If the caller has no messages (or is not a party to the case),
an empty array is returned — no error is thrown, to avoid leaking
information about message existence.

| Argument    | Type                                  | Description                                                                       |
| ----------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| `caseId`    | `Id<"cases">`                         | The case to query                                                                 |
| `partyRole` | `"INITIATOR" \| "INVITEE"` (optional) | Solo-mode filter: when provided, only messages tagged with this role are returned |

**Privacy:** Uses the `by_case_user_role` index when `partyRole` is
provided, or `by_case_and_user` otherwise. The `by_case` index (which
includes all parties' messages) is reserved for server-side AI context
assembly and is never exposed through a client-facing query.

**Solo mode:** In solo cases, both parties share the same `userId`. Pass
`partyRole` to isolate messages for the selected role.

## Mutations

### `privateCoaching/sendUserMessage`

Inserts a private message with `role=USER` and `status=COMPLETE`, then
schedules the `generateAIResponse` internal action.

| Argument    | Type                                  | Description                                                            |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `caseId`    | `Id<"cases">`                         | The case to send a message in                                          |
| `content`   | `string`                              | The message text                                                       |
| `partyRole` | `"INITIATOR" \| "INVITEE"` (optional) | Solo-mode tag: stored on the message and propagated to the AI response |

**Status guard:** The case must be in `DRAFT_PRIVATE_COACHING` or
`BOTH_PRIVATE_COACHING` status. If not, a `CONFLICT` error (HTTP 409) is
thrown.

### `privateCoaching/markComplete`

Sets the caller's `privateCoachingCompletedAt` timestamp on their
`partyStates` row. When both parties have completed, the
`synthesis/generate` action is automatically scheduled.

| Argument | Type          | Description                        |
| -------- | ------------- | ---------------------------------- |
| `caseId` | `Id<"cases">` | The case to mark coaching complete |

Returns `{ synthesisScheduled: boolean }`.

**Idempotency:** Calling `markComplete` a second time is a no-op — it
will not re-trigger synthesis.

### `privateCoaching/retryLastAIResponse`

Deletes the most recent AI message with `status=ERROR` for the caller and
reschedules `generateAIResponse`.

| Argument | Type          | Description                      |
| -------- | ------------- | -------------------------------- |
| `caseId` | `Id<"cases">` | The case to retry AI response in |

**Status guard:** The case must be in `DRAFT_PRIVATE_COACHING` or
`BOTH_PRIVATE_COACHING` status. If not, a `CONFLICT` error is thrown.

Throws `CONFLICT` if no error message exists to retry.

## Authentication

All functions require authentication via `requireAuth`. `sendUserMessage`
and `markComplete` additionally verify the caller is a party to the case
via `requirePartyToCase`.

## Internal Action — `generateAIResponse`

Scheduled by `sendUserMessage`. Calls Claude Sonnet (`claude-sonnet-4-5`)
with streaming to produce an AI coaching response.

### Flow

1. **Prompt assembly** — calls `assemblePrompt` with `role: "PRIVATE_COACH"`
   and the acting user's ID. The prompt assembly module enforces privacy
   isolation: only the acting user's form fields and message history are
   included. The other party's private messages are **never** sent to
   Claude.
2. **Insert placeholder** — creates a `privateMessages` row with
   `status=STREAMING` and empty content via `insertStreamingMessage`.
3. **Stream tokens** — reads the Claude response stream and flushes
   accumulated text to the database every ~50 ms via
   `updateStreamingMessage`.
4. **Finalize** — sets the row to `status=COMPLETE` and records the total
   token count via `finalizeStreamingMessage`.

### System prompt

The system prompt follows TechSpec §6.3.1 verbatim — a calm, curious,
non-judgmental listener that helps the user articulate their perspective.
No template content is applied (per PRD US-06 AC).

### Error handling & retries

| Scenario            | Behaviour                                          |
| ------------------- | -------------------------------------------------- |
| Non-429 API failure | Retry once after 2 s backoff                       |
| 429 rate limit      | Retry once with exponential backoff (per §6.5)     |
| Persistent failure  | Mark message `status=ERROR` via `markMessageError` |

### Test / mock mode

Set the environment variable `CLAUDE_MOCK=true` to replace the real Claude
API with a deterministic stub that returns canned tokens with a
configurable delay. Useful for E2E and integration tests (see
[testing.md](testing.md)).
