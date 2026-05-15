import { internalMutation } from "./_generated/server";

/** Well-known admin email — tests and dev tooling import this. */
export const ADMIN_EMAIL = "admin@clarity-dev.local";

/** The three default template categories created by seed. */
export const DEFAULT_CATEGORIES = ["workplace", "family", "personal"] as const;

const TEMPLATE_NAMES: Record<(typeof DEFAULT_CATEGORIES)[number], string> = {
  workplace: "Workplace Conflict",
  family: "Family Conflict",
  personal: "Personal Conflict",
};

const TEMPLATE_GUIDANCE: Record<(typeof DEFAULT_CATEGORIES)[number], string> = {
  workplace:
    "Default guidance for workplace conflicts. Focus on professional communication and finding mutually acceptable solutions.",
  family:
    "Default guidance for family conflicts. Emphasize empathy, active listening, and understanding each family member's perspective.",
  personal:
    "Default guidance for personal conflicts. Encourage self-reflection and constructive dialogue to resolve interpersonal disagreements.",
};

/**
 * Idempotent seed mutation. Creates one admin user and three default
 * templates (with initial templateVersions) if they don't already exist.
 * Throws if called in a production environment.
 *
 * Callable via: npx convex run seed:seed
 */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Production guard
    if (process.env.IS_PRODUCTION === "true") {
      throw new Error("Seed function cannot run in production");
    }

    // 1. Create or look up admin user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", ADMIN_EMAIL))
      .unique();

    const adminUserId =
      existingUser?._id ??
      (await ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        displayName: "Admin",
        role: "ADMIN",
        createdAt: Date.now(),
      }));

    // 2. Create templates + versions for each category
    for (const category of DEFAULT_CATEGORIES) {
      const existingTemplate = await ctx.db
        .query("templates")
        .withIndex("by_category", (q) => q.eq("category", category))
        .unique();

      if (existingTemplate) {
        continue;
      }

      const templateId = await ctx.db.insert("templates", {
        category,
        name: TEMPLATE_NAMES[category],
        createdAt: Date.now(),
        createdByUserId: adminUserId,
      });

      const versionId = await ctx.db.insert("templateVersions", {
        templateId,
        version: 1,
        globalGuidance: TEMPLATE_GUIDANCE[category],
        publishedAt: Date.now(),
        publishedByUserId: adminUserId,
      });

      await ctx.db.patch(templateId, { currentVersionId: versionId });
    }
  },
});
