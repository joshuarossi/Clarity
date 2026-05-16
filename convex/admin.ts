import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const templates = await ctx.db.query("templates").collect();
    const allCases = await ctx.db.query("cases").collect();

    const enriched = await Promise.all(
      templates.map(async (template) => {
        // Resolve current version number
        let currentVersion: number | null = null;
        if (template.currentVersionId) {
          const versionDoc = await ctx.db.get(template.currentVersionId);
          if (!versionDoc) {
            console.warn(
              `Template ${template._id} has currentVersionId ${template.currentVersionId} but the referenced document no longer exists`
            );
          }
          currentVersion = versionDoc ? versionDoc.version : null;
        }

        // Count cases pinned to any version of this template
        const versions = await ctx.db
          .query("templateVersions")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .collect();
        const versionIds = new Set(versions.map((v) => v._id));

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

export const get = query({
  args: { templateId: v.id("templates") },
  handler: async (ctx, { templateId }) => {
    await requireAdmin(ctx);

    const template = await ctx.db.get(templateId);
    if (!template) {
      return null;
    }

    // Resolve current version content for form pre-population
    let currentVersion = null;
    if (template.currentVersionId) {
      currentVersion = await ctx.db.get(template.currentVersionId);
    }

    // Count cases pinned to any version of this template
    const versions = await ctx.db
      .query("templateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .collect();
    const versionIds = new Set(versions.map((ver) => ver._id));

    const allCases = await ctx.db.query("cases").collect();
    const pinnedCasesCount = allCases.filter((c) =>
      versionIds.has(c.templateVersionId)
    ).length;

    return {
      ...template,
      currentVersion,
      pinnedCasesCount,
    };
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

    // Enrich with admin display names
    const enriched = await Promise.all(
      versions.map(async (ver) => {
        const user = await ctx.db.get(ver.publishedByUserId);
        return {
          ...ver,
          publishedByDisplayName: user?.displayName ?? user?.email ?? "Unknown",
        };
      })
    );

    return enriched;
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

export const listAuditLog = query({
  args: {
    actor: v.optional(v.string()),
    action: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    let q = ctx.db.query("auditLog").order("desc");

    // Apply filters on the query builder (pre-pagination)
    if (args.actor) {
      q = q.filter((q) => q.eq(q.field("actorUserId"), args.actor!));
    }
    if (args.action) {
      q = q.filter((q) => q.eq(q.field("action"), args.action!));
    }
    if (args.dateFrom !== undefined) {
      q = q.filter((q) => q.gte(q.field("createdAt"), args.dateFrom!));
    }
    if (args.dateTo !== undefined) {
      q = q.filter((q) => q.lte(q.field("createdAt"), args.dateTo!));
    }

    const results = await q.paginate(args.paginationOpts);

    // Enrich with actor display names
    const enrichedPage = await Promise.all(
      results.page.map(async (entry) => {
        const user = await ctx.db.get(entry.actorUserId);
        return {
          ...entry,
          actorDisplayName:
            user?.displayName ?? user?.email ?? `Unknown (${entry.actorUserId})`,
        };
      })
    );

    return {
      page: enrichedPage,
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});
