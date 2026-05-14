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
      - "default (schema definition via defineSchema) — the Convex schema object defining all 11 tables"
signatures:
  - "export default defineSchema({ users, cases, partyStates, privateMessages, jointMessages, draftSessions, draftMessages, inviteTokens, templates, templateVersions, auditLog })"
queries_used: []
invariants:
  - "All 11 tables must be defined: users, cases, partyStates, privateMessages, jointMessages, draftSessions, draftMessages, inviteTokens, templates, templateVersions, auditLog"
  - "Field names, types, and validators must match TechSpec §3.1 verbatim — no additions, renames, or omissions"
  - "cases.status is a union of exactly 7 literals: DRAFT_PRIVATE_COACHING, BOTH_PRIVATE_COACHING, READY_FOR_JOINT, JOINT_ACTIVE, CLOSED_RESOLVED, CLOSED_UNRESOLVED, CLOSED_ABANDONED"
  - "cases.schemaVersion is v.literal(1)"
  - "cases.templateVersionId is v.id('templateVersions')"
  - "auditLog.metadata uses v.optional(v.any()) — the one intentionally loose validator"
  - "All 15 indexes must be defined with exact names and field lists per TechSpec §3.1"
non_goals:
  - "No Convex functions (queries, mutations, actions) — only the schema file"
  - "No auth configuration — handled by a separate task"
  - "No seed data or fixtures"
  - "No runtime code beyond the declarative schema definition"
tested_by:
  - ac: "convex/schema.ts defines all 11 tables with all fields, types, and validators exactly as specified in TechSpec §3.1"
    layer: unit
    file: tests/unit/schema.test.ts
  - ac: "All indexes defined: users.by_email, cases.by_initiator, cases.by_invitee, partyStates.by_case, partyStates.by_case_and_user, privateMessages.by_case_and_user, privateMessages.by_case, jointMessages.by_case, draftSessions.by_case_and_user, draftMessages.by_draft_session, inviteTokens.by_token, inviteTokens.by_case, templates.by_category, templateVersions.by_template, auditLog.by_actor"
    layer: unit
    file: tests/unit/schema.test.ts
  - ac: "cases.status union includes all 7 states: DRAFT_PRIVATE_COACHING, BOTH_PRIVATE_COACHING, READY_FOR_JOINT, JOINT_ACTIVE, CLOSED_RESOLVED, CLOSED_UNRESOLVED, CLOSED_ABANDONED"
    layer: unit
    file: tests/unit/schema.test.ts
  - ac: "cases.schemaVersion is v.literal(1)"
    layer: unit
    file: tests/unit/schema.test.ts
  - ac: "Schema deploys successfully to the Convex development deployment via npx convex dev"
    layer: e2e
    file: N/A (CI-level check — npx convex dev --once exits 0)
    reason: "Deployment validation requires a running Convex backend; this is a CI pipeline check, not a vitest test"
  - ac: "TypeScript types are generated and importable in both convex/ and src/ code"
    layer: unit
    file: tests/unit/schema-types.test.ts
---

# Contract: WOR-95 — Convex schema definition (convex/schema.ts)

## Why this work exists

Clarity's entire backend and frontend type system depends on a single source of truth: `convex/schema.ts`. Every downstream task — auth helpers, state machine, queries, mutations, actions, and React components — imports `Doc<"tableName">` and `Id<"tableName">` from the generated types. Without this schema, no other backend or frontend task can begin. This task creates that foundational file with all 11 tables, their fields, validators, and indexes exactly as specified in TechSpec §3.1.

## Files and exports

### `convex/schema.ts` (create, config)

This file is a declarative Convex schema definition. It imports `defineSchema` and `defineTable` from `"convex/server"` and `v` from `"convex/values"`, then exports a default schema object containing all 11 table definitions.

The file has no runtime logic — it is purely declarative. Convex uses it at deploy time to enforce the schema and at build time to generate TypeScript types in `convex/_generated/`.

The export is the default export (the return value of `defineSchema()`). There are no named exports. Test code that needs to inspect the schema structure imports the default export.

**Verbatim schema from TechSpec §3.1:**

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    displayName: v.optional(v.string()),
    role: v.union(v.literal("USER"), v.literal("ADMIN")),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  cases: defineTable({
    schemaVersion: v.literal(1),
    status: v.union(
      v.literal("DRAFT_PRIVATE_COACHING"),
      v.literal("BOTH_PRIVATE_COACHING"),
      v.literal("READY_FOR_JOINT"),
      v.literal("JOINT_ACTIVE"),
      v.literal("CLOSED_RESOLVED"),
      v.literal("CLOSED_UNRESOLVED"),
      v.literal("CLOSED_ABANDONED"),
    ),
    isSolo: v.boolean(),
    category: v.string(),
    templateVersionId: v.id("templateVersions"),
    initiatorUserId: v.id("users"),
    inviteeUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    closedAt: v.optional(v.number()),
    closureSummary: v.optional(v.string()),
  })
    .index("by_initiator", ["initiatorUserId"])
    .index("by_invitee", ["inviteeUserId"]),

  partyStates: defineTable({
    caseId: v.id("cases"),
    userId: v.id("users"),
    role: v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    mainTopic: v.optional(v.string()),
    description: v.optional(v.string()),
    desiredOutcome: v.optional(v.string()),
    formCompletedAt: v.optional(v.number()),
    privateCoachingCompletedAt: v.optional(v.number()),
    synthesisText: v.optional(v.string()),
    synthesisGeneratedAt: v.optional(v.number()),
    closureProposed: v.optional(v.boolean()),
    closureConfirmed: v.optional(v.boolean()),
  })
    .index("by_case", ["caseId"])
    .index("by_case_and_user", ["caseId", "userId"]),

  privateMessages: defineTable({
    caseId: v.id("cases"),
    userId: v.id("users"),
    role: v.union(v.literal("USER"), v.literal("AI")),
    content: v.string(),
    status: v.union(v.literal("STREAMING"), v.literal("COMPLETE"), v.literal("ERROR")),
    tokens: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_case_and_user", ["caseId", "userId"])
    .index("by_case", ["caseId"]),

  jointMessages: defineTable({
    caseId: v.id("cases"),
    authorType: v.union(v.literal("USER"), v.literal("COACH")),
    authorUserId: v.optional(v.id("users")),
    content: v.string(),
    status: v.union(v.literal("STREAMING"), v.literal("COMPLETE"), v.literal("ERROR")),
    isIntervention: v.optional(v.boolean()),
    replyToId: v.optional(v.id("jointMessages")),
    createdAt: v.number(),
  }).index("by_case", ["caseId"]),

  draftSessions: defineTable({
    caseId: v.id("cases"),
    userId: v.id("users"),
    status: v.union(v.literal("ACTIVE"), v.literal("SENT"), v.literal("DISCARDED")),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    finalDraft: v.optional(v.string()),
  }).index("by_case_and_user", ["caseId", "userId"]),

  draftMessages: defineTable({
    draftSessionId: v.id("draftSessions"),
    role: v.union(v.literal("USER"), v.literal("AI")),
    content: v.string(),
    status: v.union(v.literal("STREAMING"), v.literal("COMPLETE"), v.literal("ERROR")),
    createdAt: v.number(),
  }).index("by_draft_session", ["draftSessionId"]),

  inviteTokens: defineTable({
    caseId: v.id("cases"),
    token: v.string(),
    status: v.union(v.literal("ACTIVE"), v.literal("CONSUMED"), v.literal("REVOKED")),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
    consumedByUserId: v.optional(v.id("users")),
  })
    .index("by_token", ["token"])
    .index("by_case", ["caseId"]),

  templates: defineTable({
    category: v.string(),
    name: v.string(),
    currentVersionId: v.optional(v.id("templateVersions")),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdByUserId: v.id("users"),
  }).index("by_category", ["category"]),

  templateVersions: defineTable({
    templateId: v.id("templates"),
    version: v.number(),
    globalGuidance: v.string(),
    coachInstructions: v.optional(v.string()),
    draftCoachInstructions: v.optional(v.string()),
    publishedAt: v.number(),
    publishedByUserId: v.id("users"),
    notes: v.optional(v.string()),
  }).index("by_template", ["templateId"]),

  auditLog: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_actor", ["actorUserId"]),
});
```

This is the verbatim, normative schema. The implementation author must reproduce this exactly — no field additions, renames, or omissions.

## Data dependencies

This task has no data dependencies. `convex/schema.ts` is a pure declaration — it does not call any queries, mutations, or actions. It *is* the dependency that all other Convex functions depend on.

## Invariants

**All 11 tables must be defined.** The table list is: `users`, `cases`, `partyStates`, `privateMessages`, `jointMessages`, `draftSessions`, `draftMessages`, `inviteTokens`, `templates`, `templateVersions`, `auditLog`. Missing a table means downstream tasks that import `Doc<"tableName">` or `Id<"tableName">` will fail at compile time.

**Field fidelity.** Every field name, type, and validator must match TechSpec §3.1 verbatim. This includes optionality (`v.optional(...)` vs. required), ID references (`v.id("tableName")`), and union literals. The schema is the source of truth for end-to-end type safety; any deviation breaks the contract with every downstream consumer.

**Case status union — exactly 7 states.** The `cases.status` field must be a `v.union()` of exactly these 7 literals: `DRAFT_PRIVATE_COACHING`, `BOTH_PRIVATE_COACHING`, `READY_FOR_JOINT`, `JOINT_ACTIVE`, `CLOSED_RESOLVED`, `CLOSED_UNRESOLVED`, `CLOSED_ABANDONED`. No more, no fewer. The state machine task depends on this exact set.

**Schema version literal.** `cases.schemaVersion` is `v.literal(1)`, not `v.number()`. This enables forward migration support — future schema versions will use `v.union(v.literal(1), v.literal(2))`.

**Template version pinning.** `cases.templateVersionId` is `v.id("templateVersions")` — a required field, not optional. Cases are pinned to a specific template version at creation time and never change (Key Invariant §3.2-1).

**Loose audit metadata.** `auditLog.metadata` is `v.optional(v.any())`. This is the one intentionally loose validator in the entire schema, per the spec. Do not tighten it.

**All 15 indexes.** Each index must use the exact name and field list specified. Index names follow the pattern `by_<field>` or `by_<field1>_and_<field2>`. Missing an index means downstream queries that use `.withIndex()` will fail at runtime.

## Edge cases

**No `convex/` directory exists.** The implementation must create the `convex/` directory. The Convex project was initialized (dependency on P0.1) but the worktree currently has no `convex/` directory — `npx convex dev` will create `convex/_generated/` when it processes the schema.

**Circular ID references.** `templates.currentVersionId` is `v.optional(v.id("templateVersions"))` and `templateVersions.templateId` is `v.id("templates")`. This circular reference is valid in Convex schemas — Convex resolves table references by name, not by declaration order.

**`jointMessages.replyToId` self-reference.** `jointMessages.replyToId` is `v.optional(v.id("jointMessages"))` — a self-referencing ID. This is valid in Convex.

## Non-goals

**No Convex functions.** This task creates only the schema file. Queries, mutations, and actions are defined in separate downstream tasks.

**No auth configuration.** Convex Auth setup (providers, session management) is a separate task. This schema does not include auth-related tables beyond the `users` table.

**No seed data or fixtures.** The schema is purely declarative. Test fixtures for downstream tasks will be created by those tasks.

**No runtime code.** The file contains only `defineSchema`/`defineTable` calls with validators. No helper functions, no type exports beyond what Convex generates automatically.

## Test coverage

**AC 1 (all 11 tables defined) → `tests/unit/schema.test.ts` (unit).** Import the default export from `convex/schema.ts` and assert that the schema object contains exactly 11 tables with the expected names. The schema object's structure can be inspected programmatically — `Object.keys(schema.tables)` gives the table names.

**AC 2 (all indexes) → `tests/unit/schema.test.ts` (unit).** For each table, inspect the schema definition to verify expected indexes are present with correct names and field lists. The exact inspection API depends on Convex's schema internals — the test author should explore the schema object's shape to find index metadata.

**AC 3 (7 case statuses) → `tests/unit/schema.test.ts` (unit).** Extract the `cases.status` validator from the schema and confirm it represents a union of exactly the 7 expected literal strings. The validator's internal structure can be inspected to enumerate the literal values.

**AC 4 (schemaVersion literal) → `tests/unit/schema.test.ts` (unit).** Inspect the `cases.schemaVersion` validator to confirm it is a literal validator for the value `1`.

**AC 5 (deploys successfully) → CI-level check (e2e).** This is not a vitest test. It is a CI pipeline step that runs `npx convex dev --once` (or equivalent) and asserts exit code 0. This requires a running Convex backend and cannot be meaningfully unit-tested.

**AC 6 (types importable) → `tests/unit/schema-types.test.ts` (unit).** A TypeScript file that imports `Doc<"cases">`, `Doc<"users">`, `Id<"cases">`, etc. from `convex/_generated/dataModel` and uses them in type-level assertions. The test passes if `tsc --noEmit` succeeds. Note: this test can only pass after `npx convex dev` has been run at least once to generate `convex/_generated/`, so in CI it depends on the deploy step completing first. The test author may choose to make this a compile-time check rather than a vitest test.
