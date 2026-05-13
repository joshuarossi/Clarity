---
task_id: WOR-95
ticket_summary: "Convex schema definition (convex/schema.ts)"
ac_refs:
  - "convex/schema.ts defines all 11 tables with all fields, types, and validators exactly as specified in TechSpec §3.1"
  - "All indexes defined: users.by_email, cases.by_initiator, cases.by_invitee, partyStates.by_case, partyStates.by_case_and_user, privateMessages.by_case_and_user, privateMessages.by_case, jointMessages.by_case, draftSessions.by_case_and_user, draftMessages.by_draft_session, inviteTokens.by_token, inviteTokens.by_case, templates.by_category, templateVersions.by_template, auditLog.by_actor"
  - "cases.status union includes all 7 states: DRAFT_PRIVATE_COACHING, BOTH_PRIVATE_COACHING, READY_FOR_JOINT, JOINT_ACTIVE, CLOSED_RESOLVED, CLOSED_UNRESOLVED, CLOSED_ABANDONED"
  - "cases.schemaVersion is v.literal(1)"
  - "Schema deploys successfully to the Convex development deployment via npx convex dev"
  - "TypeScript types are generated and importable in both convex/ and src/ code"
files:
  - path: convex/schema.ts
    role: config
    action: create
    exports:
      - "default (schema) — the Convex schema definition for all 11 tables, created via defineSchema()"
signatures:
  - "export default defineSchema({ users, cases, partyStates, privateMessages, jointMessages, draftSessions, draftMessages, inviteTokens, templates, templateVersions, auditLog }): SchemaDefinition"
queries_used: []
invariants:
  - "Exactly 11 tables must be defined: users, cases, partyStates, privateMessages, jointMessages, draftSessions, draftMessages, inviteTokens, templates, templateVersions, auditLog"
  - "cases.status is a v.union of exactly 7 v.literal values: DRAFT_PRIVATE_COACHING, BOTH_PRIVATE_COACHING, READY_FOR_JOINT, JOINT_ACTIVE, CLOSED_RESOLVED, CLOSED_UNRESOLVED, CLOSED_ABANDONED"
  - "cases.schemaVersion must be v.literal(1), not v.number()"
  - "cases.templateVersionId is v.id('templateVersions') — set at creation, never changed"
  - "auditLog.metadata uses v.optional(v.any()) — the only intentionally loose validator"
  - "All enum-like fields use v.union(v.literal(...)) — never v.string()"
  - "Field names, types, and indexes must match TechSpec §3.1 verbatim — no additions, renames, or omissions"
  - "15 indexes total, each named and keyed exactly as specified in TechSpec §3.1"
non_goals:
  - "No Convex functions (queries, mutations, actions) — only the schema file"
  - "No auth configuration — that is a separate task (depends on P0.1 initialization)"
  - "No seed data or fixture files"
  - "No frontend code or React components"
  - "No test infrastructure setup (vitest config, etc.) — test author will add what's needed"
tested_by:
  - ac: "convex/schema.ts defines all 11 tables with all fields, types, and validators exactly as specified in TechSpec §3.1"
    layer: unit
    file: convex/schema.test.ts
  - ac: "All indexes defined: users.by_email, cases.by_initiator, cases.by_invitee, partyStates.by_case, partyStates.by_case_and_user, privateMessages.by_case_and_user, privateMessages.by_case, jointMessages.by_case, draftSessions.by_case_and_user, draftMessages.by_draft_session, inviteTokens.by_token, inviteTokens.by_case, templates.by_category, templateVersions.by_template, auditLog.by_actor"
    layer: unit
    file: convex/schema.test.ts
  - ac: "cases.status union includes all 7 states: DRAFT_PRIVATE_COACHING, BOTH_PRIVATE_COACHING, READY_FOR_JOINT, JOINT_ACTIVE, CLOSED_RESOLVED, CLOSED_UNRESOLVED, CLOSED_ABANDONED"
    layer: unit
    file: convex/schema.test.ts
  - ac: "cases.schemaVersion is v.literal(1)"
    layer: unit
    file: convex/schema.test.ts
  - ac: "Schema deploys successfully to the Convex development deployment via npx convex dev"
    layer: e2e
    file: N/A (CI-level check, not a Vitest test)
    reason: "Deployment validation requires a live Convex backend; this is verified by running `npx convex dev --once` in CI, not by a unit test"
  - ac: "TypeScript types are generated and importable in both convex/ and src/ code"
    layer: unit
    file: convex/schema.typecheck.test.ts
---

# Contract: WOR-95 — Convex schema definition (convex/schema.ts)

## Why this work exists

Clarity's entire backend and frontend depend on a single source of truth for the data model. Without `convex/schema.ts`, no downstream task can import typed `Doc<"tableName">` or `Id<"tableName">` references, and no Convex function can be written with type safety. This ticket creates the foundational schema file that matches TechSpec §3.1 exactly, enabling all 11 tables with their fields, validators, and indexes to be available for every subsequent task.

## Files and exports

### `convex/schema.ts` (create, role: config)

This file is the single Convex schema definition for the entire application. It uses `defineSchema` and `defineTable` from `convex/server` and `v` from `convex/values` to declaratively define all 11 tables.

The file's default export is the schema object returned by `defineSchema()`. This is consumed by the Convex framework at deploy time to enforce table shapes and generate TypeScript types in `convex/_generated/`.

The schema must be a verbatim transcription of TechSpec §3.1. The implementation author should copy the schema from the TechSpec and ensure no fields are added, renamed, or omitted. Specific tables and their structures:

- **users** — email, displayName (optional), role (USER|ADMIN), createdAt. Index: `by_email`.
- **cases** — schemaVersion (literal 1), status (7-value union), isSolo, category, templateVersionId, initiatorUserId, inviteeUserId (optional), createdAt, updatedAt, closedAt (optional), closureSummary (optional). Indexes: `by_initiator`, `by_invitee`.
- **partyStates** — caseId, userId, role (INITIATOR|INVITEE), form fields (mainTopic, description, desiredOutcome — all optional), phase timestamps and state fields. Indexes: `by_case`, `by_case_and_user`.
- **privateMessages** — caseId, userId (owner), role (USER|AI), content, status (STREAMING|COMPLETE|ERROR), tokens (optional), createdAt. Indexes: `by_case_and_user`, `by_case`.
- **jointMessages** — caseId, authorType (USER|COACH), authorUserId (optional), content, status, isIntervention (optional), replyToId (optional), createdAt. Index: `by_case`.
- **draftSessions** — caseId, userId, status (ACTIVE|SENT|DISCARDED), createdAt, completedAt (optional), finalDraft (optional). Index: `by_case_and_user`.
- **draftMessages** — draftSessionId, role (USER|AI), content, status, createdAt. Index: `by_draft_session`.
- **inviteTokens** — caseId, token, status (ACTIVE|CONSUMED|REVOKED), createdAt, consumedAt (optional), consumedByUserId (optional). Indexes: `by_token`, `by_case`.
- **templates** — category, name, currentVersionId (optional), archivedAt (optional), createdAt, createdByUserId. Index: `by_category`.
- **templateVersions** — templateId, version, globalGuidance, coachInstructions (optional), draftCoachInstructions (optional), publishedAt, publishedByUserId, notes (optional). Index: `by_template`.
- **auditLog** — actorUserId, action, targetType, targetId, metadata (optional, `v.any()`), createdAt. Index: `by_actor`.

## Data dependencies

This ticket has no data dependencies — it defines the schema but does not call any queries or mutations. It is a pure configuration file consumed by the Convex framework.

## Invariants

**Exactly 11 tables.** The schema must define exactly the 11 tables listed in TechSpec §3.1. No extra tables, no missing tables. Test authors will assert on table count and table names.

**cases.status is a 7-value union.** The status field must be a `v.union()` of exactly 7 `v.literal()` values: `DRAFT_PRIVATE_COACHING`, `BOTH_PRIVATE_COACHING`, `READY_FOR_JOINT`, `JOINT_ACTIVE`, `CLOSED_RESOLVED`, `CLOSED_UNRESOLVED`, `CLOSED_ABANDONED`. No additional statuses (e.g., `COST_LIMITED` from §6.6 is explicitly deferred per the decomposition plan).

**cases.schemaVersion is v.literal(1).** This must be a literal validator, not `v.number()`. It exists for forward migration support and must reject any value other than `1`.

**cases.templateVersionId is v.id("templateVersions").** This is a hard reference to the templateVersions table, set at case creation and never changed (Key Invariant §3.2-1).

**auditLog.metadata is v.optional(v.any()).** This is the only intentionally loose validator in the entire schema. All other fields use precise validators.

**Enum-like fields use v.union(v.literal(...)).** Fields like `role`, `status`, `authorType` must never be typed as plain `v.string()`. The union of literals provides both runtime validation and TypeScript type narrowing.

**15 indexes total.** Each index must be named and keyed exactly as specified. The index names are part of the public API — downstream queries reference them by name.

## Edge cases

**Loading state:** Not applicable — this is a declarative schema file with no runtime behavior.

**Empty state:** Not applicable — the schema defines table shapes but does not require any data to exist.

**Error state:** If the schema contains a syntax error or invalid validator, `npx convex dev` will fail with a deployment error. The implementation author should verify deployment succeeds. If validators reference table names that don't exist (e.g., `v.id("nonexistent")`), Convex will reject the schema at deploy time.

**Forward compatibility:** The `schemaVersion: v.literal(1)` field is designed for future schema migrations. v1 code must always write `1` here. If a future version needs schema changes, a new literal value will be added and migration logic can branch on it.

## Non-goals

**No Convex functions.** This ticket creates only the schema file. Queries, mutations, and actions are defined in subsequent tasks that depend on this one.

**No auth configuration.** Convex Auth setup is a separate task. The `users` table in the schema is defined here, but the auth provider configuration (magic link, Google OAuth) is out of scope.

**No seed data or fixtures.** The schema is purely declarative. Test fixtures for downstream tasks will be created by those tasks.

**No frontend code.** No React components, hooks, or routing. The schema's generated types will be consumed by frontend code in later tasks.

**No test infrastructure setup.** The test author will add vitest configuration, convex-test setup, or whatever test tooling is needed. The implementation author should not add test config — only `convex/schema.ts`.

## Test coverage

**AC 1 (all 11 tables defined) — unit, `convex/schema.test.ts`:** Import the schema and assert the table count is 11. Verify each of the 11 table names exists as a key. This is a static/structural test since the schema is declarative.

**AC 2 (all indexes) — unit, `convex/schema.test.ts`:** For each table, verify the expected indexes are present in the schema definition. The test should check all 15 indexes by name. This can be done by inspecting the schema object programmatically or via snapshot testing.

**AC 3 (7 case statuses) — unit, `convex/schema.test.ts`:** Extract the `cases.status` validator and confirm it accepts all 7 valid status strings. The test should also verify that an invalid status string (e.g., `"INVALID"`) is not accepted.

**AC 4 (schemaVersion literal) — unit, `convex/schema.test.ts`:** Verify the `cases.schemaVersion` validator only accepts the value `1` and rejects other numbers (e.g., `2`, `0`).

**AC 5 (deploys successfully) — e2e (CI-level):** This is not a Vitest test. It is verified by running `npx convex dev --once` in CI and asserting exit code 0. The test author should document this expectation but does not need to write a test file for it.

**AC 6 (types importable) — unit, `convex/schema.typecheck.test.ts`:** A compile-time check: a test file that imports `Doc<"cases">`, `Doc<"users">`, `Id<"cases">`, etc. from `convex/_generated/dataModel` and assigns typed variables. The assertion is that `tsc --noEmit` passes. Note: this test can only pass after `npx convex dev` has been run to generate the types, so it may be a CI-only test or require a codegen step in the test setup.
