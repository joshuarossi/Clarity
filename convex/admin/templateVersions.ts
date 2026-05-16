import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAdmin } from "../lib/auth";

export const list = query({
  args: { templateId: v.id("templates") },
  returns: v.array(
    v.object({
      _id: v.id("templateVersions"),
      _creationTime: v.number(),
      templateId: v.id("templates"),
      version: v.number(),
      globalGuidance: v.string(),
      coachInstructions: v.optional(v.string()),
      draftCoachInstructions: v.optional(v.string()),
      publishedAt: v.number(),
      publishedByUserId: v.id("users"),
      notes: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const versions = await ctx.db
      .query("templateVersions")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    versions.sort((a, b) => b.version - a.version);
    return versions;
  },
});
