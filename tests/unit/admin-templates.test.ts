import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

/**
 * WOR-132: Admin Convex module — template CRUD, versioning, audit log writes.
 *
 * Tests use convex-test with the project schema and generated API references.
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

/**
 * Seeds an admin user and a regular user for authorization testing.
 */
async function seedUsers() {
  const t = convexTest(schema);
  const adminId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "admin@test.com",
      displayName: "Admin",
      role: "ADMIN",
      createdAt: Date.now(),
    }),
  );
  const regularId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "user@test.com",
      displayName: "User",
      role: "USER",
      createdAt: Date.now(),
    }),
  );
  return { t, adminId, regularId };
}

// ── AC: admin/templates/listAll ─────────────────────────────────────────

describe("admin/templates/listAll", () => {
  it("returns all templates including archived ones for admin user", async () => {
    const { t, adminId } = await seedUsers();

    // Seed an active template and an archived template
    await t.run(async (ctx) => {
      await ctx.db.insert("templates", {
        category: "workplace",
        name: "Active Template",
        createdAt: Date.now(),
        createdByUserId: adminId,
      });
      await ctx.db.insert("templates", {
        category: "family",
        name: "Archived Template",
        createdAt: Date.now(),
        createdByUserId: adminId,
        archivedAt: Date.now(),
      });
    });

    const asAdmin = t.withIdentity({ email: "admin@test.com" });
    const result = await asAdmin.query(api.admin.templates.listAll, {});

    expect(result).toHaveLength(2);
    const names = result.map(
      (tpl: { name: string }) => tpl.name,
    );
    expect(names).toContain("Active Template");
    expect(names).toContain("Archived Template");
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const { t } = await seedUsers();
    const asUser = t.withIdentity({ email: "user@test.com" });

    await expectConvexError(
      asUser.query(api.admin.templates.listAll, {}),
      "FORBIDDEN",
    );
  });
});

// ── AC: admin/templateVersions/list ─────────────────────────────────────

describe("admin/templateVersions/list", () => {
  it("returns all versions for a template sorted by version descending", async () => {
    const { t, adminId } = await seedUsers();

    const templateId = await t.run(async (ctx) => {
      const tplId = await ctx.db.insert("templates", {
        category: "workplace",
        name: "Multi-version Template",
        createdAt: Date.now(),
        createdByUserId: adminId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 1,
        globalGuidance: "v1 guidance",
        publishedAt: Date.now(),
        publishedByUserId: adminId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 2,
        globalGuidance: "v2 guidance",
        publishedAt: Date.now(),
        publishedByUserId: adminId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 3,
        globalGuidance: "v3 guidance",
        publishedAt: Date.now(),
        publishedByUserId: adminId,
      });
      return tplId;
    });

    const asAdmin = t.withIdentity({ email: "admin@test.com" });
    const result = await asAdmin.query(api.admin.templateVersions.list, {
      templateId,
    });

    expect(result).toHaveLength(3);
    expect(result[0].version).toBe(3);
    expect(result[1].version).toBe(2);
    expect(result[2].version).toBe(1);
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const { t, adminId } = await seedUsers();

    const templateId = await t.run(async (ctx) =>
      ctx.db.insert("templates", {
        category: "workplace",
        name: "Test Template",
        createdAt: Date.now(),
        createdByUserId: adminId,
      }),
    );

    const asUser = t.withIdentity({ email: "user@test.com" });
    await expectConvexError(
      asUser.query(api.admin.templateVersions.list, { templateId }),
      "FORBIDDEN",
    );
  });
});

// ── AC: admin/templates/create ──────────────────────────────────────────

describe("admin/templates/create", () => {
  it("creates template + initial version (v1) and records TEMPLATE_CREATED audit log", async () => {
    const { t, adminId } = await seedUsers();

    const asAdmin = t.withIdentity({ email: "admin@test.com" });
    const result = await asAdmin.mutation(api.admin.templates.create, {
      category: "workplace",
      name: "New Template",
      globalGuidance: "Be collaborative",
    });

    expect(result.templateId).toBeDefined();
    expect(result.versionId).toBeDefined();

    // Verify template row
    const template = await t.run(async (ctx) =>
      ctx.db.get(result.templateId),
    );
    expect(template).not.toBeNull();
    expect(template!.name).toBe("New Template");
    expect(template!.category).toBe("workplace");
    expect(template!.currentVersionId).toBe(result.versionId);
    expect(template!.createdByUserId).toBe(adminId);

    // Verify version row
    const version = await t.run(async (ctx) =>
      ctx.db.get(result.versionId),
    );
    expect(version).not.toBeNull();
    expect(version!.version).toBe(1);
    expect(version!.globalGuidance).toBe("Be collaborative");
    expect(version!.templateId).toBe(result.templateId);
    expect(version!.publishedByUserId).toBe(adminId);

    // Verify audit log entry
    const auditLogs = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    expect(auditLogs).toHaveLength(1);
    const log = auditLogs[0];
    expect(log.actorUserId).toBe(adminId);
    expect(log.action).toBe("TEMPLATE_CREATED");
    expect(log.targetType).toBe("template");
    expect(log.targetId).toBe(result.templateId);
    expect(log.metadata).toEqual(
      expect.objectContaining({
        name: "New Template",
        category: "workplace",
        versionId: result.versionId,
      }),
    );
    expect(log.createdAt).toBeTypeOf("number");
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const { t } = await seedUsers();
    const asUser = t.withIdentity({ email: "user@test.com" });

    await expectConvexError(
      asUser.mutation(api.admin.templates.create, {
        category: "workplace",
        name: "Attempt",
        globalGuidance: "test",
      }),
      "FORBIDDEN",
    );
  });
});

// ── AC: admin/templates/publishNewVersion ───────────────────────────────

describe("admin/templates/publishNewVersion", () => {
  it("creates new immutable version with monotonic number, updates currentVersionId, records TEMPLATE_PUBLISHED audit log", async () => {
    const { t, adminId } = await seedUsers();

    // Create template with initial version
    const asAdmin = t.withIdentity({ email: "admin@test.com" });
    const created = await asAdmin.mutation(api.admin.templates.create, {
      category: "workplace",
      name: "Versioned Template",
      globalGuidance: "v1 guidance",
    });

    // Publish v2
    const published = await asAdmin.mutation(
      api.admin.templates.publishNewVersion,
      {
        templateId: created.templateId,
        globalGuidance: "v2 guidance",
        notes: "Updated for clarity",
      },
    );

    expect(published.versionId).toBeDefined();

    // Verify new version row
    const v2 = await t.run(async (ctx) => ctx.db.get(published.versionId));
    expect(v2).not.toBeNull();
    expect(v2!.version).toBe(2);
    expect(v2!.globalGuidance).toBe("v2 guidance");
    expect(v2!.notes).toBe("Updated for clarity");
    expect(v2!.templateId).toBe(created.templateId);

    // Verify old v1 row is unchanged (immutability)
    const v1 = await t.run(async (ctx) => ctx.db.get(created.versionId));
    expect(v1).not.toBeNull();
    expect(v1!.version).toBe(1);
    expect(v1!.globalGuidance).toBe("v1 guidance");

    // Verify template.currentVersionId updated
    const template = await t.run(async (ctx) =>
      ctx.db.get(created.templateId),
    );
    expect(template!.currentVersionId).toBe(published.versionId);

    // Verify audit log (second entry after TEMPLATE_CREATED)
    const auditLogs = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    const publishLog = auditLogs.find(
      (l) => l.action === "TEMPLATE_PUBLISHED",
    );
    expect(publishLog).toBeDefined();
    expect(publishLog!.actorUserId).toBe(adminId);
    expect(publishLog!.targetType).toBe("templateVersion");
    expect(publishLog!.targetId).toBe(published.versionId);
    expect(publishLog!.metadata).toEqual(
      expect.objectContaining({
        templateId: created.templateId,
        version: 2,
      }),
    );
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const { t, adminId } = await seedUsers();

    const templateId = await t.run(async (ctx) => {
      const tplId = await ctx.db.insert("templates", {
        category: "workplace",
        name: "Test",
        createdAt: Date.now(),
        createdByUserId: adminId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 1,
        globalGuidance: "g",
        publishedAt: Date.now(),
        publishedByUserId: adminId,
      });
      return tplId;
    });

    const asUser = t.withIdentity({ email: "user@test.com" });
    await expectConvexError(
      asUser.mutation(api.admin.templates.publishNewVersion, {
        templateId,
        globalGuidance: "new",
      }),
      "FORBIDDEN",
    );
  });
});

// ── AC: Existing cases pinned to old template versions unaffected ────────

describe("existing cases pinned to old versions", () => {
  it("are unaffected by new version publication", async () => {
    const { t, adminId } = await seedUsers();
    const asAdmin = t.withIdentity({ email: "admin@test.com" });

    // Create template
    const created = await asAdmin.mutation(api.admin.templates.create, {
      category: "workplace",
      name: "Pinning Template",
      globalGuidance: "original guidance",
    });

    // Seed a case pinned to v1
    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: created.versionId,
        initiatorUserId: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    // Publish v2
    await asAdmin.mutation(api.admin.templates.publishNewVersion, {
      templateId: created.templateId,
      globalGuidance: "updated guidance for v2",
    });

    // Verify case still pinned to v1
    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc!.templateVersionId).toBe(created.versionId);

    // Verify v1 data intact
    const v1 = await t.run(async (ctx) => ctx.db.get(created.versionId));
    expect(v1!.globalGuidance).toBe("original guidance");
    expect(v1!.version).toBe(1);
  });
});

// ── AC: admin/templates/archive ─────────────────────────────────────────

describe("admin/templates/archive", () => {
  it("sets archivedAt timestamp and records TEMPLATE_ARCHIVED audit log", async () => {
    const { t, adminId } = await seedUsers();
    const asAdmin = t.withIdentity({ email: "admin@test.com" });

    const created = await asAdmin.mutation(api.admin.templates.create, {
      category: "workplace",
      name: "To Archive",
      globalGuidance: "guidance",
    });

    await asAdmin.mutation(api.admin.templates.archive, {
      templateId: created.templateId,
    });

    // Verify archivedAt is set
    const template = await t.run(async (ctx) =>
      ctx.db.get(created.templateId),
    );
    expect(template!.archivedAt).toBeTypeOf("number");

    // Verify audit log
    const auditLogs = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    const archiveLog = auditLogs.find(
      (l) => l.action === "TEMPLATE_ARCHIVED",
    );
    expect(archiveLog).toBeDefined();
    expect(archiveLog!.actorUserId).toBe(adminId);
    expect(archiveLog!.targetType).toBe("template");
    expect(archiveLog!.targetId).toBe(created.templateId);
    expect(archiveLog!.metadata).toEqual(
      expect.objectContaining({ name: "To Archive" }),
    );
    expect(archiveLog!.createdAt).toBeTypeOf("number");
  });

  it("admin listAll still returns archived template", async () => {
    const { t } = await seedUsers();
    const asAdmin = t.withIdentity({ email: "admin@test.com" });

    const created = await asAdmin.mutation(api.admin.templates.create, {
      category: "workplace",
      name: "Archived Visible",
      globalGuidance: "guidance",
    });

    await asAdmin.mutation(api.admin.templates.archive, {
      templateId: created.templateId,
    });

    const allTemplates = await asAdmin.query(api.admin.templates.listAll, {});
    const found = allTemplates.find(
      (tpl: { name: string }) => tpl.name === "Archived Visible",
    );
    expect(found).toBeDefined();
    expect(found!.archivedAt).toBeTypeOf("number");
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const { t, adminId } = await seedUsers();

    const templateId = await t.run(async (ctx) =>
      ctx.db.insert("templates", {
        category: "workplace",
        name: "Test",
        createdAt: Date.now(),
        createdByUserId: adminId,
      }),
    );

    const asUser = t.withIdentity({ email: "user@test.com" });
    await expectConvexError(
      asUser.mutation(api.admin.templates.archive, { templateId }),
      "FORBIDDEN",
    );
  });
});

// ── AC: Archived templates remain resolvable by pinned cases ────────────

describe("archived templates resolvable by pinned cases", () => {
  it("version data remains intact after template is archived", async () => {
    const { t, adminId } = await seedUsers();
    const asAdmin = t.withIdentity({ email: "admin@test.com" });

    const created = await asAdmin.mutation(api.admin.templates.create, {
      category: "family",
      name: "Family Template",
      globalGuidance: "family guidance",
      coachInstructions: "coach instructions",
    });

    // Seed a case pinned to this version
    await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "family",
        templateVersionId: created.versionId,
        initiatorUserId: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    // Archive the template
    await asAdmin.mutation(api.admin.templates.archive, {
      templateId: created.templateId,
    });

    // Verify version data still resolvable
    const version = await t.run(async (ctx) =>
      ctx.db.get(created.versionId),
    );
    expect(version).not.toBeNull();
    expect(version!.globalGuidance).toBe("family guidance");
    expect(version!.coachInstructions).toBe("coach instructions");
    expect(version!.templateId).toBe(created.templateId);
  });
});

// ── AC: Audit log structure ─────────────────────────────────────────────

describe("audit log records", () => {
  it("contains actorUserId, action, targetType, targetId, metadata, createdAt for every admin operation", async () => {
    const { t, adminId } = await seedUsers();
    const asAdmin = t.withIdentity({ email: "admin@test.com" });

    // Perform create, publishNewVersion, and archive
    const created = await asAdmin.mutation(api.admin.templates.create, {
      category: "workplace",
      name: "Audit Test",
      globalGuidance: "guidance",
    });

    await asAdmin.mutation(api.admin.templates.publishNewVersion, {
      templateId: created.templateId,
      globalGuidance: "v2",
    });

    await asAdmin.mutation(api.admin.templates.archive, {
      templateId: created.templateId,
    });

    const auditLogs = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );

    expect(auditLogs).toHaveLength(3);

    // Every log entry must have all required fields
    for (const log of auditLogs) {
      expect(log.actorUserId).toBe(adminId);
      expect(log.action).toBeTypeOf("string");
      expect(log.targetType).toBeTypeOf("string");
      expect(log.targetId).toBeTypeOf("string");
      expect(log.metadata).toBeDefined();
      expect(log.createdAt).toBeTypeOf("number");
    }

    // Verify expected actions present
    const actions = auditLogs.map((l) => l.action);
    expect(actions).toContain("TEMPLATE_CREATED");
    expect(actions).toContain("TEMPLATE_PUBLISHED");
    expect(actions).toContain("TEMPLATE_ARCHIVED");
  });
});
