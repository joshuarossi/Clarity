# Draft Coach API

> Module: `convex/draftCoach.ts` · Tickets: WOR-127, WOR-128

## Overview

The Draft Coach is a private, short-lived AI conversation that helps a party
craft a polished message before sending it into the joint chat. Unlike private
coaching (which is a free-form session spanning the entire case), a Draft Coach
session is tightly scoped: it starts when the user wants help composing a
single message and ends when the draft is sent or discarded.

Draft Coach conversations are **invisible to the other party** — only the
final, approved message appears in the joint chat.

## Schema

### `draftSessions`

| Field         | Type                              | Description                          |
|---------------|-----------------------------------|--------------------------------------|
| `caseId`      | Id\<"cases"\>                     | The case this session belongs to     |
| `userId`      | Id\<"users"\>                     | The party who owns the session       |
| `status`      | `"ACTIVE" \| "SENT" \| "DISCARDED"` | Session lifecycle state           |
| `createdAt`   | number                            | Epoch ms when session was started    |
| `completedAt` | number \| undefined               | Epoch ms when session ended          |
| `finalDraft`  | string \| undefined               | The AI-produced draft text           |

Index: `by_case_and_user` — (`caseId`, `userId`)

### `draftMessages`

| Field            | Type                                   | Description                       |
|------------------|----------------------------------------|-----------------------------------|
| `draftSessionId` | Id\<"draftSessions"\>                 | Parent session                    |
| `role`           | `"USER" \| "AI"`                      | Who sent the message              |
| `content`        | string                                 | Message body                      |
| `status`         | `"STREAMING" \| "COMPLETE" \| "ERROR"` | Delivery state                   |
| `createdAt`      | number                                 | Epoch ms                          |

Index: `by_draft_session` — (`draftSessionId`)

## Public Functions

### `draftCoach/session` (query)

Returns `{ session, messages }` for the caller's active draft session on the
given case, or `null` if no active session exists. Enforces that
`session.userId` matches the authenticated caller (privacy constraint).

**Args:** `{ caseId: Id<"cases"> }`

### `draftCoach/startSession` (mutation)

Creates a new `draftSessions` row with `status: "ACTIVE"` and schedules
the Draft Coach AI action (`draftCoach/generateResponse`) for the initial
prompt.

**Args:** `{ caseId: Id<"cases"> }`

### `draftCoach/sendMessage` (mutation)

Inserts a `draftMessages` row with `role: "USER"`, `status: "COMPLETE"` and
schedules the AI action.

**Args:** `{ sessionId: Id<"draftSessions">, content: string }`

### `draftCoach/sendFinalDraft` (mutation)

Reads `session.finalDraft`, inserts it directly into the `jointMessages` table
(mutations cannot call other mutations in Convex), and marks the session
`status: "SENT"` with `completedAt`. Also schedules the joint chat coach
response via `generateCoachResponse`. Throws a `ConvexError` with code
`CONFLICT` if `finalDraft` is not yet populated.

**Args:** `{ sessionId: Id<"draftSessions"> }`

### `draftCoach/discardSession` (mutation)

Marks the session `status: "DISCARDED"` with `completedAt`. No message is
sent to the joint chat.

**Args:** `{ sessionId: Id<"draftSessions"> }`

## AI Generation

### `draftCoach/generateResponse` (internalAction)

The core AI action behind the Draft Coach experience. It is scheduled
automatically by `startSession` (for the opening coaching message) and by
`sendMessage` (after each user turn). It is **not** callable from the client.

**Args:** `{ sessionId: Id<"draftSessions">, userId: Id<"users"> }`

#### Context assembly

The action builds a prompt using `assemblePrompt` with `role: "DRAFT_COACH"`.
The context window includes:

- **Joint-chat history** — all `COMPLETE` joint messages for the case
  (visible to both parties).
- **Acting user's synthesis** — from their `partyState.synthesisText`.
- **Category-specific template** — `draftCoachInstructions` from the case's
  pinned `templateVersion`, falling back to `globalGuidance` when absent.
- **Draft conversation history** — all prior draft messages in the session.

**Privacy boundary:** the other party's synthesis, private coaching messages,
and party state are never queried.

#### Readiness detection

Before calling the AI, the action checks the latest USER draft message against
a set of canonical readiness signals (case-insensitive, trimmed):

- `"i'm ready"`
- `"draft it"`
- `"write the message"`
- `"looks good, write it"`
- `"Generate Draft"` (exact — sent by the UI button)

When readiness is detected, the prompt instructs the AI to respond with a
structured `{ "draft": "..." }` JSON block. The extracted text is persisted
to `draftSession.finalDraft` via `setSessionFinalDraft`. If parsing fails,
the response is stored as a normal message (graceful degradation).

**The draft is never auto-sent.** The user must explicitly approve it through
the `sendFinalDraft` mutation (see above).

#### Streaming

Follows the same lifecycle as the private coaching and joint chat AI actions:

1. Insert a `draftMessages` row with `status: "STREAMING"` and empty content.
2. Batch content updates every ~50 ms via `updateStreamingDraftMessage`.
3. Finalize with `status: "COMPLETE"` and log the total token count.

#### Error handling

On API failure the action retries once after a 2 s backoff. On a second
failure the draft message is marked `status: "ERROR"`. No further retries are
attempted automatically.

### `draftCoach/retryLastDraftAIResponse` (mutation)

Deletes the last `ERROR` draft message in the session and re-schedules
`generateResponse`. Requires auth + session ownership.

**Args:** `{ sessionId: Id<"draftSessions"> }`

## Authorization

All public functions require:

1. **Authentication** — a valid session token (via the shared auth helper).
2. **Party-to-case check** — the authenticated user must be a party on the
   referenced case.
3. **Privacy** — the session query additionally filters by `userId` so a
   party can never read another party's draft coach sessions.
