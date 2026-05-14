## WOR-95 — Convex schema definition

Added the foundational Convex schema (`convex/schema.ts`) defining all 11
data-model tables — users, cases, partyStates, privateMessages,
jointMessages, draftSessions, draftMessages, inviteTokens, templates,
templateVersions, and auditLog — with typed validators, 15 indexes, and
the 7-state case lifecycle. This enables end-to-end typed
`Doc<"tableName">` and `Id<"tableName">` references for all downstream
backend and frontend tasks.
