import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const templates = await ctx.db.query("templates").collect();

    const enriched = await Promise.all(
      templates.map(async (template) => {
        // Resolve current version number
        let currentVersion: number | null = null;
        if (template.currentVersionId) {
          const versionDoc = await ctx.db.get(template.currentVersionId);
          currentVersion = versionDoc ? versionDoc.version : null;
        }

        // Count cases pinned to any version of this template
        const versions = await ctx.db
          .query("templateVersions")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .collect();
        const versionIds = new Set(versions.map((v) => v._id));

        const allCases = await ctx.db.query("cases").collect();
        const pinnedCasesCount = allCases.filter((c) =>
          versionIds.has(c.templateVersionId)
        ).length;

        return {
          ...template,
          currentVersion,
          pinnedCasesCount,
        };
      })
    );

    return enriched;
  },
});

export const listVersions = query({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }) => {
    await requireAdmin(ctx);
    const versions = await ctx.db
      .query("templateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .collect();
    versions.sort((a, b) => b.version - a.version);
    return versions;
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
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const templateId = await ctx.db.insert("templates", {
      category: args.category,
      name: args.name,
      createdAt: Date.now(),
      createdByUserId: admin._id,
    });

    const versionId = await ctx.db.insert("templateVersions", {
      templateId,
      version: 1,
      globalGuidance: args.globalGuidance,
      coachInstructions: args.coachInstructions,
      draftCoachInstructions: args.draftCoachInstructions,
      publishedAt: Date.now(),
      publishedByUserId: admin._id,
    });

    await ctx.db.patch(templateId, { currentVersionId: versionId });

    await ctx.db.insert("auditLog", {
      actorUserId: admin._id,
      action: "TEMPLATE_CREATED",
      targetType: "template",
      targetId: templateId as string,
      metadata: { category: args.category, name: args.name, versionId: versionId as string },
      createdAt: Date.now(),
    });

    return templateId;
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
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Template not found", httpStatus: 404 });
    }

    const existingVersions = await ctx.db
      .query("templateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version), 0);
    const newVersion = maxVersion + 1;

    const versionId = await ctx.db.insert("templateVersions", {
      templateId: args.templateId,
      version: newVersion,
      globalGuidance: args.globalGuidance,
      coachInstructions: args.coachInstructions,
      draftCoachInstructions: args.draftCoachInstructions,
      notes: args.notes,
      publishedAt: Date.now(),
      publishedByUserId: admin._id,
    });

    await ctx.db.patch(args.templateId, { currentVersionId: versionId });

    await ctx.db.insert("auditLog", {
      actorUserId: admin._id,
      action: "TEMPLATE_PUBLISHED",
      targetType: "templateVersion",
      targetId: versionId as string,
      metadata: { templateId: args.templateId as string, version: newVersion },
      createdAt: Date.now(),
    });

    return versionId;
  },
});

export const archive = mutation({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }) => {
    const admin = await requireAdmin(ctx);

    const template = await ctx.db.get(templateId);
    if (!template) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Template not found", httpStatus: 404 });
    }

    await ctx.db.patch(templateId, { archivedAt: Date.now() });

    await ctx.db.insert("auditLog", {
      actorUserId: admin._id,
      action: "TEMPLATE_ARCHIVED",
      targetType: "template",
      targetId: templateId as string,
      metadata: {},
      createdAt: Date.now(),
    });

    return null;
  },
});
