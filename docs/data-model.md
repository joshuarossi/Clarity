# Data Model

Clarity's data model is defined in `convex/schema.ts` using Convex's
`defineSchema` / `defineTable` API. The schema is the single source of truth —
Convex generates runtime validators and TypeScript types (`Doc<"tableName">`,
`Id<"tableName">`) from it automatically.

## Tables

| Table | Purpose |
|---|---|
| `users` | User accounts (email, display name, role) |
| `cases` | Mediation cases — the top-level entity linking two parties |
| `partyStates` | Per-party state within a case (form answers, coaching progress) |
| `privateMessages` | Private coaching chat messages (isolated per party) |
| `jointMessages` | Joint session chat messages (visible to both parties) |
| `draftSessions` | Draft Coach sessions — private drafting workspace |
| `draftMessages` | Messages within a draft session |
| `inviteTokens` | One-time tokens used to invite the second party to a case |
| `templates` | Coaching prompt templates, organized by category |
| `templateVersions` | Versioned snapshots of a template's guidance text |
| `auditLog` | Append-only log of significant actions for traceability |

## Case statuses

A case progresses through a defined state machine with seven statuses:

1. **DRAFT_PRIVATE_COACHING** — initiator is filling out forms / coaching privately
2. **BOTH_PRIVATE_COACHING** — both parties are coaching privately
3. **READY_FOR_JOINT** — both parties finished private coaching; joint session can begin
4. **JOINT_ACTIVE** — joint mediated conversation is in progress
5. **CLOSED_RESOLVED** — case closed with a resolution
6. **CLOSED_UNRESOLVED** — case closed without resolution
7. **CLOSED_ABANDONED** — case abandoned before completion

## Schema versioning

Every case row carries a `schemaVersion` field (currently locked to `1`) so
future migrations can distinguish legacy rows from new ones.

## Indexes

Each table defines indexes for the queries downstream tasks will need. Key
examples:

- `users.by_email` — look up a user by email address
- `cases.by_initiator` / `cases.by_invitee` — list cases for a given party
- `partyStates.by_case_and_user` — fetch a specific party's state in a case
- `inviteTokens.by_token` — redeem an invite token
- `auditLog.by_actor` — activity history for a user

See `convex/schema.ts` for the complete list.
