import { describe, it, expect, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { ADMIN_EMAIL, DEFAULT_CATEGORIES } from "../../convex/seed";
import { internal } from "../../convex/_generated/api";

/**
 * WOR-106: Seed data script tests
 *
 * Tests cover all 4 acceptance criteria using convex-test with the project
 * schema. At red state, the import from convex/seed.ts produces TS2307
 * because the module has not been created yet — that is the expected
 * red-state error and is tolerated by the validator.
 */

// ── AC1: Admin user creation with role='ADMIN' and known email ───────

describe("AC1 — admin user with role ADMIN and known email", () => {
  it("ADMIN_EMAIL constant equals 'admin@clarity-dev.local'", () => {
    expect(ADMIN_EMAIL).toBe("admin@clarity-dev.local");
  });

  it("creates exactly one user with the admin email after seeding", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    const users = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", ADMIN_EMAIL))
        .collect();
    });
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe(ADMIN_EMAIL);
  });

  it("admin user has role 'ADMIN'", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    const users = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", ADMIN_EMAIL))
        .collect();
    });
    expect(users[0].role).toBe("ADMIN");
  });
});

// ── AC2: 3 default templates with initial templateVersions ───────────

describe("AC2 — 3 default templates: workplace, family, personal", () => {
  it("DEFAULT_CATEGORIES contains exactly ['workplace', 'family', 'personal']", () => {
    expect(DEFAULT_CATEGORIES).toEqual(["workplace", "family", "personal"]);
  });

  it("creates a template for each default category", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    for (const category of DEFAULT_CATEGORIES) {
      const templates = await t.run(async (ctx) => {
        return ctx.db
          .query("templates")
          .withIndex("by_category", (q) => q.eq("category", category))
          .collect();
      });
      expect(
        templates,
        `expected exactly one template for category "${category}"`,
      ).toHaveLength(1);
    }
  });

  it("each template has a non-null currentVersionId", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    for (const category of DEFAULT_CATEGORIES) {
      const templates = await t.run(async (ctx) => {
        return ctx.db
          .query("templates")
          .withIndex("by_category", (q) => q.eq("category", category))
          .collect();
      });
      expect(
        templates[0].currentVersionId,
        `currentVersionId should be set for "${category}" template`,
      ).toBeTruthy();
    }
  });

  it("each linked templateVersion has version 1 and non-empty globalGuidance", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    for (const category of DEFAULT_CATEGORIES) {
      const result = await t.run(async (ctx) => {
        const templates = await ctx.db
          .query("templates")
          .withIndex("by_category", (q) => q.eq("category", category))
          .collect();
        const template = templates[0];
        const versionId = template.currentVersionId;
        if (!versionId) {
          return null;
        }
        const version = await ctx.db.get(versionId);
        return version;
      });

      expect(result, `templateVersion for "${category}"`).not.toBeNull();
      expect(result?.version).toBe(1);
      expect(result?.globalGuidance).toBeTruthy();
      expect(
        result?.globalGuidance.length,
        `globalGuidance for "${category}" should be non-empty`,
      ).toBeGreaterThan(0);
    }
  });

  it("each templateVersion has a publishedAt timestamp", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    const versions = await t.run(async (ctx) => {
      return ctx.db.query("templateVersions").collect();
    });

    expect(versions).toHaveLength(3);
    for (const version of versions) {
      expect(version.publishedAt).toBeGreaterThan(0);
    }
  });

  it("each template's createdByUserId references the admin user", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    const adminUser = await t.run(async (ctx) => {
      const users = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", ADMIN_EMAIL))
        .collect();
      return users[0];
    });

    const templates = await t.run(async (ctx) => {
      return ctx.db.query("templates").collect();
    });

    for (const template of templates) {
      expect(template.createdByUserId).toEqual(adminUser._id);
    }
  });

  it("each templateVersion's publishedByUserId references the admin user", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    const adminUser = await t.run(async (ctx) => {
      const users = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", ADMIN_EMAIL))
        .collect();
      return users[0];
    });

    const versions = await t.run(async (ctx) => {
      return ctx.db.query("templateVersions").collect();
    });

    for (const version of versions) {
      expect(version.publishedByUserId).toEqual(adminUser._id);
    }
  });
});

// ── AC3: Idempotency — no duplicates on second run ───────────────────

describe("AC3 — seed is idempotent (no duplicates on second run)", () => {
  it("running seed twice yields exactly 1 admin user", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});
    await t.mutation(internal.seed.seed, {});

    const users = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", ADMIN_EMAIL))
        .collect();
    });
    expect(users).toHaveLength(1);
  });

  it("running seed twice yields exactly 3 templates (not 6)", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});
    await t.mutation(internal.seed.seed, {});

    const templates = await t.run(async (ctx) => {
      return ctx.db.query("templates").collect();
    });
    expect(templates).toHaveLength(3);
  });

  it("running seed twice yields exactly 3 template versions (not 6)", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});
    await t.mutation(internal.seed.seed, {});

    const versions = await t.run(async (ctx) => {
      return ctx.db.query("templateVersions").collect();
    });
    expect(versions).toHaveLength(3);
  });

  it("second seed run does not alter the admin user's data", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    const userBefore = await t.run(async (ctx) => {
      const users = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", ADMIN_EMAIL))
        .collect();
      return users[0];
    });

    await t.mutation(internal.seed.seed, {});

    const userAfter = await t.run(async (ctx) => {
      const users = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", ADMIN_EMAIL))
        .collect();
      return users[0];
    });

    expect(userAfter._id).toEqual(userBefore._id);
    expect(userAfter.createdAt).toBe(userBefore.createdAt);
  });
});

// ── AC4: Production environment guard ────────────────────────────────

describe("AC4 — seed throws in production environment", () => {
  const savedIsProduction = process.env.IS_PRODUCTION;

  afterEach(() => {
    if (savedIsProduction === undefined) {
      delete process.env.IS_PRODUCTION;
    } else {
      process.env.IS_PRODUCTION = savedIsProduction;
    }
  });

  it("throws an error when IS_PRODUCTION is 'true'", async () => {
    process.env.IS_PRODUCTION = "true";
    const t = convexTest(schema);
    await expect(t.mutation(internal.seed.seed, {})).rejects.toThrow();
  });

  it("users table remains empty after production-guarded rejection", async () => {
    process.env.IS_PRODUCTION = "true";
    const t = convexTest(schema);

    try {
      await t.mutation(internal.seed.seed, {});
    } catch {
      // expected — production guard
    }

    const users = await t.run(async (ctx) => {
      return ctx.db.query("users").collect();
    });
    expect(users).toHaveLength(0);
  });

  it("templates table remains empty after production-guarded rejection", async () => {
    process.env.IS_PRODUCTION = "true";
    const t = convexTest(schema);

    try {
      await t.mutation(internal.seed.seed, {});
    } catch {
      // expected — production guard
    }

    const templates = await t.run(async (ctx) => {
      return ctx.db.query("templates").collect();
    });
    expect(templates).toHaveLength(0);
  });

  it("succeeds when IS_PRODUCTION is unset", async () => {
    delete process.env.IS_PRODUCTION;
    const t = convexTest(schema);
    await t.mutation(internal.seed.seed, {});

    const users = await t.run(async (ctx) => {
      return ctx.db.query("users").collect();
    });
    expect(users).toHaveLength(1);
  });
});
