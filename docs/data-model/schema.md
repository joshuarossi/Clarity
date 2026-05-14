# Convex Schema — Data Model Reference

The Convex schema is defined in `convex/schema.ts` and is the single
source of truth for Clarity's data model. It generates both runtime
validators and TypeScript types used end-to-end.

## Tables

| Table | Purpose |
|---|---|
| `users` | Registered user accounts (email, displayName, role) |
| `cases` | Mediation cases with lifecycle status and template reference |
| `partyStates` | Per-party progress within a case (form data, coaching, synthesis) |
| `privateMessages` | Private coaching chat messages between a user and the AI |
| `jointMessages` | Joint-session messages visible to both parties and the AI coach |
| `draftSessions` | Draft-message authoring sessions within a joint session |
| `draftMessages` | Individual messages within a draft session |
| `inviteTokens` | Invite links for the second party to join a case |
| `templates` | Coaching prompt template definitions |
| `templateVersions` | Versioned snapshots of a template's guidance text |
| `auditLog` | Immutable event log of user and system actions |

## Case lifecycle statuses

A case progresses through up to 7 statuses:

1. `DRAFT_PRIVATE_COACHING` — initiator is privately coaching with the AI
2. `BOTH_PRIVATE_COACHING` — both parties are privately coaching
3. `READY_FOR_JOINT` — both parties completed coaching; joint session can begin
4. `JOINT_ACTIVE` — joint mediation session is in progress
5. `CLOSED_RESOLVED` — case closed with a resolution
6. `CLOSED_UNRESOLVED` — case closed without resolution
7. `CLOSED_ABANDONED` — case abandoned by one or both parties

## Indexes

Each table defines indexes for the queries that downstream tasks will use:

- **users**: `by_email`
- **cases**: `by_initiator`, `by_invitee`
- **partyStates**: `by_case`, `by_case_and_user`
- **privateMessages**: `by_case_and_user`, `by_case`
- **jointMessages**: `by_case`
- **draftSessions**: `by_case_and_user`
- **draftMessages**: `by_draft_session`
- **inviteTokens**: `by_token`, `by_case`
- **templates**: `by_category`
- **templateVersions**: `by_template`
- **auditLog**: `by_actor`

## Schema version

`cases.schemaVersion` is set to `v.literal(1)`. This field supports
future schema migrations — all cases created under the current schema
carry version `1`.

## Usage in code

Convex generates typed helpers from the schema. Import them from
`convex/_generated/dataModel`:

```ts
import { Doc, Id } from "convex/_generated/dataModel";

// Typed document
const user: Doc<"users"> = …;

// Typed ID reference
const caseId: Id<"cases"> = …;
```
