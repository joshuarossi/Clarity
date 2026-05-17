import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

/**
 * WOR-132: Admin Convex module — template CRUD, versioning, audit log writes.
 *
 * Integration tests using convex-test with the project schema and generated
 * API FunctionReferences.
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
      displayName: "Admin",
      role: "ADMIN",
      createdAt: Date.now(),
    }),
  );
}

async function seedRegularUser(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "user@test.com",
      displayName: "Regular",
      role: "USER",
      createdAt: Date.now(),
    }),
  );
}

// ── AC: admin/templates/listAll ─────────────────────────────────────────

describe("admin/listAll query", () => {
  it("returns all templates including archived ones", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    await t.run(async (ctx) => {
      const tpl1 = await ctx.db.insert("templates", {
        category: "workplace",
        name: "Active Template",
        createdAt: Date.now(),
        createdByUserId: adminId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tpl1,
        version: 1,
        globalGuidance: "guidance 1",
        publishedAt: Date.now(),
        publishedByUserId: adminId,
      });

      const tpl2 = await ctx.db.insert("templates", {
        category: "family",
        name: "Archived Template",
        archivedAt: Date.now(),
        createdAt: Date.now(),
        createdByUserId: adminId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tpl2,
        version: 1,
        globalGuidance: "guidance 2",
        publishedAt: Date.now(),
        publishedByUserId: adminId,
      });
    });

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAll, {});

    expect(result).toHaveLength(2);
    const names = result.map((tpl: { name: string }) => tpl.name);
    expect(names).toContain("Active Template");
    expect(names).toContain("Archived Template");
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const t = convexTest(schema);
    await seedRegularUser(t);

    await expectConvexError(
      t.withIdentity({ email: "user@test.com" }).query(api.admin.listAll, {}),
      "FORBIDDEN",
    );
  });
});

// ── AC: admin/templateVersions/list sorted descending ───────────────────

describe("admin/listVersions query", () => {
  it("returns all versions for a template sorted by version number descending", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

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
        publishedAt: Date.now() - 3000,
        publishedByUserId: adminId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 2,
        globalGuidance: "v2 guidance",
        publishedAt: Date.now() - 2000,
        publishedByUserId: adminId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 3,
        globalGuidance: "v3 guidance",
        publishedAt: Date.now() - 1000,
        publishedByUserId: adminId,
      });
      return tplId;
    });

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listVersions, { templateId });

    expect(result).toHaveLength(3);
    expect(result[0].version).toBe(3);
    expect(result[1].version).toBe(2);
    expect(result[2].version).toBe(1);
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const t = convexTest(schema);
    await seedRegularUser(t);
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin2@test.com",
        displayName: "Admin2",
        role: "ADMIN",
        createdAt: Date.now(),
      }),
    );
    const templateId = await t.run(async (ctx) =>
      ctx.db.insert("templates", {
        category: "workplace",
        name: "Template",
        createdAt: Date.now(),
        createdByUserId: adminId,
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ email: "user@test.com" })
        .query(api.admin.listVersions, { templateId }),
      "FORBIDDEN",
    );
  });
});

// ── AC: create mutation ─────────────────────────────────────────────────

describe("admin/create mutation", () => {
  it("creates template + initial version (v1) + audit log entry", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "New Template",
        globalGuidance: "Initial guidance",
        coachInstructions: "Coach instructions",
      });

    // Verify template was created
    const template = await t.run(async (ctx) => ctx.db.get(templateId));
    expect(template).not.toBeNull();
    expect(template!.category).toBe("workplace");
    expect(template!.name).toBe("New Template");
    expect(template!.currentVersionId).toBeDefined();
    expect(template!.createdByUserId).toBe(adminId);

    // Verify v1 was created
    const versions = await t.run(async (ctx) =>
      ctx.db
        .query("templateVersions")
        .withIndex("by_template", (q) => q.eq("templateId", templateId))
        .collect(),
    );
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].globalGuidance).toBe("Initial guidance");
    expect(versions[0].coachInstructions).toBe("Coach instructions");
    expect(versions[0].publishedByUserId).toBe(adminId);

    // Verify currentVersionId points to v1
    expect(template!.currentVersionId).toBe(versions[0]._id);

    // Verify audit log entry
    const auditLogs = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorUserId", adminId))
        .collect(),
    );
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe("TEMPLATE_CREATED");
    expect(auditLogs[0].targetType).toBe("template");
    expect(auditLogs[0].actorUserId).toBe(adminId);
    expect(auditLogs[0].createdAt).toBeTypeOf("number");
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const t = convexTest(schema);
    await seedRegularUser(t);

    await expectConvexError(
      t.withIdentity({ email: "user@test.com" }).mutation(api.admin.create, {
        category: "workplace",
        name: "Template",
        globalGuidance: "guidance",
      }),
      "FORBIDDEN",
    );
  });
});

// ── AC: publishNewVersion mutation ──────────────────────────────────────

describe("admin/publishNewVersion mutation", () => {
  it("creates immutable version with monotonic number, updates currentVersionId, writes audit log", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    // Create template with v1
    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Versioned Template",
        globalGuidance: "v1 guidance",
      });

    // Get v1 data before publishing v2
    const v1Before = await t.run(async (ctx) => {
      const versions = await ctx.db
        .query("templateVersions")
        .withIndex("by_template", (q) => q.eq("templateId", templateId))
        .collect();
      return versions[0];
    });

    // Publish v2
    const newVersionId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.publishNewVersion, {
        templateId,
        globalGuidance: "v2 guidance",
        coachInstructions: "v2 coach",
        notes: "Updated version",
      });

    // Verify new version row
    const newVersion = await t.run(async (ctx) => ctx.db.get(newVersionId));
    expect(newVersion).not.toBeNull();
    expect(newVersion!.version).toBe(2);
    expect(newVersion!.globalGuidance).toBe("v2 guidance");
    expect(newVersion!.coachInstructions).toBe("v2 coach");
    expect(newVersion!.notes).toBe("Updated version");

    // Verify currentVersionId updated
    const template = await t.run(async (ctx) => ctx.db.get(templateId));
    expect(template!.currentVersionId).toBe(newVersionId);

    // Verify v1 is unchanged (immutability)
    const v1After = await t.run(async (ctx) => ctx.db.get(v1Before._id));
    expect(v1After!.version).toBe(v1Before.version);
    expect(v1After!.globalGuidance).toBe(v1Before.globalGuidance);
    expect(v1After!.publishedAt).toBe(v1Before.publishedAt);

    // Verify audit log
    const auditLogs = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorUserId", adminId))
        .collect(),
    );
    const publishLog = auditLogs.find(
      (log) => log.action === "TEMPLATE_PUBLISHED",
    );
    expect(publishLog).toBeDefined();
    expect(publishLog!.targetType).toBe("templateVersion");
    expect(publishLog!.targetId).toBe(newVersionId as string);
    expect(publishLog!.actorUserId).toBe(adminId);
  });

  it("throws NOT_FOUND for non-existent template", async () => {
    const t = convexTest(schema);
    await seedAdmin(t);

    // Create a template to get a valid-format ID, then use a different one
    const templateId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("templates", {
        category: "workplace",
        name: "Temp",
        createdAt: Date.now(),
        createdByUserId: (await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", "admin@test.com"))
          .unique())!._id,
      });
      await ctx.db.delete(id);
      return id;
    });

    await expectConvexError(
      t
        .withIdentity({ email: "admin@test.com" })
        .mutation(api.admin.publishNewVersion, {
          templateId,
          globalGuidance: "guidance",
        }),
      "NOT_FOUND",
    );
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const t = convexTest(schema);
    await seedRegularUser(t);
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin3@test.com",
        displayName: "Admin3",
        role: "ADMIN",
        createdAt: Date.now(),
      }),
    );
    const templateId = await t.run(async (ctx) =>
      ctx.db.insert("templates", {
        category: "workplace",
        name: "Template",
        createdAt: Date.now(),
        createdByUserId: adminId,
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ email: "user@test.com" })
        .mutation(api.admin.publishNewVersion, {
          templateId,
          globalGuidance: "guidance",
        }),
      "FORBIDDEN",
    );
  });
});

// ── AC: Existing cases pinned to old versions unaffected ────────────────

describe("case pinning unaffected by new version publication", () => {
  it("existing case templateVersionId and version data remain unchanged after publishNewVersion", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    // Create template with v1
    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Case-Pinned Template",
        globalGuidance: "v1 guidance for case",
      });

    // Get v1 ID
    const v1Id = await t.run(async (ctx) => {
      const template = await ctx.db.get(templateId);
      return template!.currentVersionId!;
    });

    // Create a case pinned to v1
    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1 as const,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: v1Id,
        initiatorUserId: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    // Publish v2
    await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.publishNewVersion, {
        templateId,
        globalGuidance: "v2 guidance",
      });

    // Verify case still points to v1
    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc!.templateVersionId).toBe(v1Id);

    // Verify v1 data unchanged
    const v1Doc = await t.run(async (ctx) => ctx.db.get(v1Id));
    expect(v1Doc!.globalGuidance).toBe("v1 guidance for case");
    expect(v1Doc!.version).toBe(1);
  });
});

// ── AC: archive mutation ────────────────────────────────────────────────

describe("admin/archive mutation", () => {
  it("sets archivedAt timestamp and writes audit log entry", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Template To Archive",
        globalGuidance: "guidance",
      });

    const result = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.archive, { templateId });

    expect(result).toBeNull();

    // Verify archivedAt is set
    const template = await t.run(async (ctx) => ctx.db.get(templateId));
    expect(template!.archivedAt).toBeTypeOf("number");

    // Verify audit log
    const auditLogs = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorUserId", adminId))
        .collect(),
    );
    const archiveLog = auditLogs.find(
      (log) => log.action === "TEMPLATE_ARCHIVED",
    );
    expect(archiveLog).toBeDefined();
    expect(archiveLog!.targetType).toBe("template");
    expect(archiveLog!.targetId).toBe(templateId as string);
  });

  it("is idempotent — archiving again overwrites archivedAt and writes new audit log", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Double Archive",
        globalGuidance: "guidance",
      });

    // Archive first time
    await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.archive, { templateId });

    const templateAfterFirst = await t.run(async (ctx) =>
      ctx.db.get(templateId),
    );
    expect(templateAfterFirst!.archivedAt).toBeTypeOf("number");

    // Archive second time (small delay simulated by just calling again)
    await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.archive, { templateId });

    const templateAfterSecond = await t.run(async (ctx) =>
      ctx.db.get(templateId),
    );
    expect(templateAfterSecond!.archivedAt).toBeTypeOf("number");

    // Verify two TEMPLATE_ARCHIVED audit log entries
    const auditLogs = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorUserId", adminId))
        .collect(),
    );
    const archiveLogs = auditLogs.filter(
      (log) => log.action === "TEMPLATE_ARCHIVED",
    );
    expect(archiveLogs).toHaveLength(2);
  });

  it("throws NOT_FOUND for non-existent template", async () => {
    const t = convexTest(schema);
    await seedAdmin(t);

    const templateId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("templates", {
        category: "workplace",
        name: "Temp",
        createdAt: Date.now(),
        createdByUserId: (await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", "admin@test.com"))
          .unique())!._id,
      });
      await ctx.db.delete(id);
      return id;
    });

    await expectConvexError(
      t
        .withIdentity({ email: "admin@test.com" })
        .mutation(api.admin.archive, { templateId }),
      "NOT_FOUND",
    );
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const t = convexTest(schema);
    await seedRegularUser(t);
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin4@test.com",
        displayName: "Admin4",
        role: "ADMIN",
        createdAt: Date.now(),
      }),
    );
    const templateId = await t.run(async (ctx) =>
      ctx.db.insert("templates", {
        category: "workplace",
        name: "Template",
        createdAt: Date.now(),
        createdByUserId: adminId,
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ email: "user@test.com" })
        .mutation(api.admin.archive, { templateId }),
      "FORBIDDEN",
    );
  });
});

// ── AC: Archived templates still resolvable by pinned cases ─────────────

describe("archived template resolvability", () => {
  it("listAll still returns archived templates", async () => {
    const t = convexTest(schema);
    await seedAdmin(t);

    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Will Archive",
        globalGuidance: "guidance",
      });

    await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.archive, { templateId });

    const allTemplates = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listAll, {});

    const found = allTemplates.find(
      (tpl: { _id: string }) => tpl._id === templateId,
    );
    expect(found).toBeDefined();
    expect(found!.archivedAt).toBeTypeOf("number");
  });

  it("pinned case can still resolve template version data after archive", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Archivable Template",
        globalGuidance: "resolvable guidance",
      });

    const v1Id = await t.run(async (ctx) => {
      const template = await ctx.db.get(templateId);
      return template!.currentVersionId!;
    });

    // Create case pinned to v1
    await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1 as const,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: v1Id,
        initiatorUserId: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    // Archive the template
    await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.archive, { templateId });

    // Verify version data still resolvable
    const versionDoc = await t.run(async (ctx) => ctx.db.get(v1Id));
    expect(versionDoc).not.toBeNull();
    expect(versionDoc!.globalGuidance).toBe("resolvable guidance");
    expect(versionDoc!.version).toBe(1);

    // Verify listVersions still works for archived template
    const versions = await t
      .withIdentity({ email: "admin@test.com" })
      .query(api.admin.listVersions, { templateId });
    expect(versions).toHaveLength(1);
    expect(versions[0].globalGuidance).toBe("resolvable guidance");
  });
});

// ── AC: Audit log structure ─────────────────────────────────────────────

describe("audit log structure", () => {
  it("create mutation writes audit log with all required fields", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Audit Test Template",
        globalGuidance: "guidance",
      });

    const auditLogs = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorUserId", adminId))
        .collect(),
    );

    expect(auditLogs).toHaveLength(1);
    const log = auditLogs[0];
    expect(log.actorUserId).toBe(adminId);
    expect(log.action).toBe("TEMPLATE_CREATED");
    expect(log.targetType).toBe("template");
    expect(log.targetId).toBe(templateId as string);
    expect(log.metadata).toBeDefined();
    expect(log.createdAt).toBeTypeOf("number");
  });

  it("publishNewVersion writes audit log with targetType templateVersion", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Audit Publish Template",
        globalGuidance: "v1",
      });

    const newVersionId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.publishNewVersion, {
        templateId,
        globalGuidance: "v2",
      });

    const auditLogs = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorUserId", adminId))
        .collect(),
    );

    const publishLog = auditLogs.find(
      (log) => log.action === "TEMPLATE_PUBLISHED",
    );
    expect(publishLog).toBeDefined();
    expect(publishLog!.actorUserId).toBe(adminId);
    expect(publishLog!.targetType).toBe("templateVersion");
    expect(publishLog!.targetId).toBe(newVersionId as string);
    expect(publishLog!.metadata).toBeDefined();
    expect(publishLog!.createdAt).toBeTypeOf("number");
  });

  it("archive writes audit log with targetType template", async () => {
    const t = convexTest(schema);
    const adminId = await seedAdmin(t);

    const templateId = await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.create, {
        category: "workplace",
        name: "Audit Archive Template",
        globalGuidance: "guidance",
      });

    await t
      .withIdentity({ email: "admin@test.com" })
      .mutation(api.admin.archive, { templateId });

    const auditLogs = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_actor", (q) => q.eq("actorUserId", adminId))
        .collect(),
    );

    const archiveLog = auditLogs.find(
      (log) => log.action === "TEMPLATE_ARCHIVED",
    );
    expect(archiveLog).toBeDefined();
    expect(archiveLog!.actorUserId).toBe(adminId);
    expect(archiveLog!.targetType).toBe("template");
    expect(archiveLog!.targetId).toBe(templateId as string);
    expect(archiveLog!.createdAt).toBeTypeOf("number");
  });
});
