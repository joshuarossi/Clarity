import { v, ConvexError } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireAdmin } from "../lib/auth";

export const listAll = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("templates"),
      _creationTime: v.number(),
      category: v.string(),
      name: v.string(),
      currentVersionId: v.optional(v.id("templateVersions")),
      archivedAt: v.optional(v.number()),
      createdAt: v.number(),
      createdByUserId: v.id("users"),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("templates").collect();
  },
});

export const create = mutation({
  args: {
    category: v.string(),
    name: v.string(),
    globalGuidance: v.string(),
    coachInstructions: v.optional(v.string()),
    draftCoachInstructions: v.optional(v.string()),
  },
  returns: v.object({
    templateId: v.id("templates"),
    versionId: v.id("templateVersions"),
  }),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);

    if (args.name.trim() === "") {
      throw new ConvexError({
        code: "INVALID_ARGS" as const,
        message: "Template name cannot be empty",
      });
    }
    if (args.globalGuidance.trim() === "") {
      throw new ConvexError({
        code: "INVALID_ARGS" as const,
        message: "Global guidance cannot be empty",
      });
    }

    const now = Date.now();

    const templateId = await ctx.db.insert("templates", {
      category: args.category,
      name: args.name,
      createdAt: now,
      createdByUserId: user._id,
    });

    const versionId = await ctx.db.insert("templateVersions", {
      templateId,
      version: 1,
      globalGuidance: args.globalGuidance,
      coachInstructions: args.coachInstructions,
      draftCoachInstructions: args.draftCoachInstructions,
      publishedAt: now,
      publishedByUserId: user._id,
    });

    await ctx.db.patch(templateId, { currentVersionId: versionId });

    await ctx.db.insert("auditLog", {
      actorUserId: user._id,
      action: "TEMPLATE_CREATED",
      targetType: "template",
      targetId: templateId,
      metadata: { name: args.name, category: args.category, versionId },
      createdAt: now,
    });

    return { templateId, versionId };
  },
});

export const publishNewVersion = mutation({
  args: {
    templateId: v.id("templates"),
    globalGuidance: v.string(),
    coachInstructions: v.optional(v.string()),
    draftCoachInstructions: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({ versionId: v.id("templateVersions") }),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND" as const,
        message: `Template ${args.templateId} not found`,
      });
    }

    const existingVersions = await ctx.db
      .query("templateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    const maxVersion = existingVersions.reduce(
      (max, v) => Math.max(max, v.version),
      0,
    );

    const now = Date.now();

    const versionId = await ctx.db.insert("templateVersions", {
      templateId: args.templateId,
      version: maxVersion + 1,
      globalGuidance: args.globalGuidance,
      coachInstructions: args.coachInstructions,
      draftCoachInstructions: args.draftCoachInstructions,
      publishedAt: now,
      publishedByUserId: user._id,
      notes: args.notes,
    });

    await ctx.db.patch(args.templateId, { currentVersionId: versionId });

    await ctx.db.insert("auditLog", {
      actorUserId: user._id,
      action: "TEMPLATE_PUBLISHED",
      targetType: "templateVersion",
      targetId: versionId,
      metadata: { templateId: args.templateId, version: maxVersion + 1 },
      createdAt: now,
    });

    return { versionId };
  },
});

export const archive = mutation({
  args: { templateId: v.id("templates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND" as const,
        message: `Template ${args.templateId} not found`,
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.templateId, { archivedAt: now });

    await ctx.db.insert("auditLog", {
      actorUserId: user._id,
      action: "TEMPLATE_ARCHIVED",
      targetType: "template",
      targetId: args.templateId,
      metadata: { name: template.name },
      createdAt: now,
    });

    return null;
  },
});
