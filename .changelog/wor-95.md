## WOR-95: Convex schema definition

Added the foundational Convex schema (`convex/schema.ts`) defining all 11 data
model tables — users, cases, partyStates, privateMessages, jointMessages,
draftSessions, draftMessages, inviteTokens, templates, templateVersions, and
auditLog — with full field validators and indexes. This schema is the single
source of truth for Clarity's data model and generates the TypeScript types used
across the entire stack.
