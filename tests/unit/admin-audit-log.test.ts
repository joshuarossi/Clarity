import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { ConvexError } from "convex/values";
import schema from "../../convex/schema";

const api = anyApi;

/**
 * WOR-135: Admin audit log page — unit tests.
 *
 * Tests the server-side admin gate on `listAuditLog` query and basic
 * pagination/filtering behavior using convex-test.
 */

// ── Helpers ─────────────────────────────────────────────────────────────

async function expectConvexError(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  let caughtError: unknown = undefined;
  try {
    await promise;
  } catch (error) {
    caughtError = error;
  }
  expect(
    caughtError,
    `Expected ConvexError with code "${expectedCode}"`,
  ).toBeDefined();
  expect(caughtError).toBeInstanceOf(ConvexError);
  const ce = caughtError as ConvexError<{ code: string }>;
  expect(ce.data.code).toBe(expectedCode);
}

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "admin@test.com",
      displayName: "Admin User",
      role: "ADMIN",
      createdAt: Date.now(),
    }),
  );
}

async function seedRegularUser(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "user@test.com",
      displayName: "Regular User",
      role: "USER",
      createdAt: Date.now(),
    }),
  );
}

async function seedAuditEntries(
  t: ReturnType<typeof convexTest>,
  adminId: ReturnType<typeof seedAdmin> extends Promise<infer T> ? T : never,
  count: number,
) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: i % 2 === 0 ? "TEMPLATE_CREATED" : "TEMPLATE_PUBLISHED",
        targetType: "template",
        targetId: `template_${i}`,
        metadata: { index: i },
        createdAt: Date.now() - (count - i) * 1000,
      });
    }
  });
}

// ── AC: Server-side admin gate on listAuditLog ─────────────────────────

describe("admin/listAuditLog query — admin gate", () => {
  it("throws FORBIDDEN when called by a non-admin user", async () => {
    const t = convexTest(schema);
    await seedRegularUser(t);

    await expectConvexError(
      t.withIdentity({ email: "user@test.com" }).query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 25, cursor: null },
      }),
      "FORBIDDEN",
    );
  });

  it("throws FORBIDDEN when called without authentication", async () => {
    const t = convexTest(schema);

    await expectConvexError(
      t.query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 25, cursor: null },
      }),
      "FORBIDDEN",
    );
  });

  it("returns results when called by an admin user", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);
    await seedAuditEntries(t, adminId, 3);

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 25, cursor: null },
      });

    expect(result.page).toHaveLength(3);
    expect(result.isDone).toBe(true);
  });
});

// ── AC: Paginated results ──────────────────────────────────────────────

describe("admin/listAuditLog query — pagination", () => {
  it("returns paginated results respecting numItems", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);
    await seedAuditEntries(t, adminId, 10);

    const firstPage = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 5, cursor: null },
      });

    expect(firstPage.page).toHaveLength(5);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.continueCursor).toBeDefined();
  });

  it("returns remaining results with continuation cursor", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);
    await seedAuditEntries(t, adminId, 7);

    const firstPage = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 5, cursor: null },
      });

    const secondPage = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 5, cursor: firstPage.continueCursor },
      });

    expect(secondPage.page).toHaveLength(2);
    expect(secondPage.isDone).toBe(true);
  });
});

// ── AC: Filterable by actor, action type, and date range ───────────────

describe("admin/listAuditLog query — filtering", () => {
  it("filters by actor userId", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    // Create a second admin to have entries from different actors
    const admin2Id = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin2@test.com",
        displayName: "Admin Two",
        role: "ADMIN",
        createdAt: Date.now(),
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_CREATED",
        targetType: "template",
        targetId: "tpl_1",
        createdAt: Date.now(),
      });
      await ctx.db.insert("auditLog", {
        actorUserId: admin2Id,
        action: "TEMPLATE_PUBLISHED",
        targetType: "template",
        targetId: "tpl_2",
        createdAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        actor: adminId,
        paginationOpts: { numItems: 25, cursor: null },
      });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].actorUserId).toBe(adminId);
  });

  it("filters by action type", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);
    await seedAuditEntries(t, adminId, 6);

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        action: "TEMPLATE_CREATED",
        paginationOpts: { numItems: 25, cursor: null },
      });

    // seedAuditEntries creates alternating actions: even=CREATED, odd=PUBLISHED
    // 6 entries: indices 0,2,4 are CREATED = 3
    expect(result.page).toHaveLength(3);
    for (const entry of result.page) {
      expect(entry.action).toBe("TEMPLATE_CREATED");
    }
  });

  it("filters by date range (inclusive)", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_CREATED",
        targetType: "template",
        targetId: "old",
        createdAt: now - 100000,
      });
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_PUBLISHED",
        targetType: "template",
        targetId: "mid",
        createdAt: now - 50000,
      });
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_ARCHIVED",
        targetType: "template",
        targetId: "new",
        createdAt: now,
      });
    });

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        dateFrom: now - 60000,
        dateTo: now - 40000,
        paginationOpts: { numItems: 25, cursor: null },
      });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].targetId).toBe("mid");
  });

  it("combines multiple filters with AND logic", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_CREATED",
        targetType: "template",
        targetId: "match",
        createdAt: now - 5000,
      });
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_PUBLISHED",
        targetType: "template",
        targetId: "wrong_action",
        createdAt: now - 5000,
      });
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_CREATED",
        targetType: "template",
        targetId: "wrong_date",
        createdAt: now - 200000,
      });
    });

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        actor: adminId,
        action: "TEMPLATE_CREATED",
        dateFrom: now - 10000,
        dateTo: now,
        paginationOpts: { numItems: 25, cursor: null },
      });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].targetId).toBe("match");
  });
});

// ── AC: Actor enrichment (actorDisplayName) ────────────────────────────

describe("admin/listAuditLog query — actor enrichment", () => {
  it("enriches entries with actorDisplayName from users table", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_CREATED",
        targetType: "template",
        targetId: "tpl_1",
        createdAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 25, cursor: null },
      });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].actorDisplayName).toBe("Admin User");
  });

  it("falls back to email when displayName is not set", async () => {
    const t = convexTest(schema);

    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "nodisplay@test.com",
        role: "ADMIN",
        createdAt: Date.now(),
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("auditLog", {
        actorUserId: adminId,
        action: "TEMPLATE_CREATED",
        targetType: "template",
        targetId: "tpl_1",
        createdAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity({ email: "nodisplay@test.com" })
      .query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 25, cursor: null },
      });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].actorDisplayName).toBe("nodisplay@test.com");
  });
});

// ── AC: Empty results ──────────────────────────────────────────────────

describe("admin/listAuditLog query — empty state", () => {
  it("returns empty page when no audit entries exist", async () => {
    const t = convexTest(schema);
    await seedAdmin(t);

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        paginationOpts: { numItems: 25, cursor: null },
      });

    expect(result.page).toHaveLength(0);
    expect(result.isDone).toBe(true);
  });

  it("returns empty page when filters match nothing", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);
    await seedAuditEntries(t, adminId, 5);

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAuditLog, {
        action: "NONEXISTENT_ACTION",
        paginationOpts: { numItems: 25, cursor: null },
      });

    expect(result.page).toHaveLength(0);
    expect(result.isDone).toBe(true);
  });
});
