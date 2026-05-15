// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { users: _authUsers, ...otherAuthTables } = authTables;

export default defineSchema({
  ...otherAuthTables,

  users: defineTable({
    email: v.string(),
    displayName: v.optional(v.string()),
    role: v.union(v.literal("USER"), v.literal("ADMIN")),
    createdAt: v.number(),
    // Auth fields (optional, used by @convex-dev/auth internals)
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    .index("by_email", ["email"])
    .index("email", ["email"]),

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
