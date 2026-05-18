import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";

/**
 * WOR-166: convex/testSupport.ts — internal mutations for test data seeding
 *
 * Tests verify that the internal mutations in convex/testSupport.ts
 * correctly create and manage test data in the Convex database.
 *
 * At red state: convex/testSupport.ts does not exist yet, so
 * ctx.runMutation calls will fail because the function cannot be
 * resolved. That is the correct red state — the mutations haven't
 * been implemented yet.
 */

const internalApi = anyApi;

/**
 * Seeds a convex-test instance with a template + version so that
 * createTestCase can find a templateVersion to assign.
 */
async function seedTemplate(category = "workplace") {
  const t = convexTest(schema);
  const adminId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "seed-admin@test.com",
      displayName: "Seed Admin",
      role: "ADMIN",
      createdAt: Date.now(),
    }),
  );
  await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category,
      name: `${category} Template`,
      createdAt: Date.now(),
      createdByUserId: adminId,
    });
    const vId = await ctx.db.insert("templateVersions", {
      templateId: tplId,
      version: 1,
      globalGuidance: "Test guidance",
      publishedAt: Date.now(),
      publishedByUserId: adminId,
    });
    await ctx.db.patch(tplId, { currentVersionId: vId });
  });
  return t;
}

// ── createTestUser ──────────────────────────────────────────────────────

describe("WOR-166: testSupport.createTestUser", () => {
  it("creates a user with the given email and returns userId as string", async () => {
    const t = convexTest(schema);
    const result = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestUser, {
        email: "newuser@test.com",
      }),
    );

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);

    const user = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "newuser@test.com"))
        .unique(),
    );
    expect(user).not.toBeNull();
    expect(user?.email).toBe("newuser@test.com");
  });

  it("defaults role to USER when not specified", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestUser, {
        email: "defaultrole@test.com",
      }),
    );

    const user = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "defaultrole@test.com"))
        .unique(),
    );
    expect(user?.role).toBe("USER");
  });

  it("creates a user with ADMIN role when specified", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestUser, {
        email: "admin@test.com",
        role: "ADMIN",
      }),
    );

    const user = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "admin@test.com"))
        .unique(),
    );
    expect(user?.role).toBe("ADMIN");
  });

  it("is idempotent — same email returns same userId without duplicating", async () => {
    const t = convexTest(schema);
    const id1 = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestUser, {
        email: "idempotent@test.com",
      }),
    );
    const id2 = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestUser, {
        email: "idempotent@test.com",
      }),
    );

    expect(id1).toBe(id2);

    const users = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "idempotent@test.com"))
        .collect(),
    );
    expect(users).toHaveLength(1);
  });

  it("auto-derives displayName from the email prefix", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestUser, {
        email: "jane.doe@company.org",
      }),
    );

    const user = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "jane.doe@company.org"))
        .unique(),
    );
    expect(user?.displayName).toBe("jane.doe");
  });

  it("uses provided displayName when specified", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestUser, {
        email: "named@test.com",
        displayName: "Custom Name",
      }),
    );

    const user = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "named@test.com"))
        .unique(),
    );
    expect(user?.displayName).toBe("Custom Name");
  });
});

// ── createTestCase ──────────────────────────────────────────────────────

describe("WOR-166: testSupport.createTestCase", () => {
  it("creates a case and returns caseId as string", async () => {
    const t = await seedTemplate();
    const result = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "init@test.com",
      }),
    );

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("defaults status to DRAFT_PRIVATE_COACHING", async () => {
    const t = await seedTemplate();
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "draft-status@test.com",
      }),
    );

    const caseDoc = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return cases[0];
    });
    expect(caseDoc?.status).toBe("DRAFT_PRIVATE_COACHING");
  });

  it("creates a partyState with role INITIATOR for the initiator", async () => {
    const t = await seedTemplate();
    const caseId = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "init-party@test.com",
      }),
    );

    const partyStates = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    expect(partyStates.length).toBeGreaterThanOrEqual(1);
    const initiatorState = partyStates.find((ps) => ps.role === "INITIATOR");
    expect(initiatorState).toBeDefined();
  });

  it("creates partyStates for both parties when inviteeEmail is provided", async () => {
    const t = await seedTemplate();
    const caseId = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "init-two@test.com",
        inviteeEmail: "invitee-two@test.com",
      }),
    );

    const partyStates = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    expect(partyStates).toHaveLength(2);
    const roles = partyStates.map((ps) => ps.role).sort();
    expect(roles).toEqual(["INITIATOR", "INVITEE"]);
  });

  it("assigns a valid templateVersionId to the case", async () => {
    const t = await seedTemplate();
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "tpl-check@test.com",
      }),
    );

    const caseDoc = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return cases[0];
    });
    expect(caseDoc).toBeDefined();
    expect(caseDoc?.templateVersionId).toBeDefined();
  });

  it("respects a custom status parameter", async () => {
    const t = await seedTemplate();
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "custom-status@test.com",
        status: "READY_FOR_JOINT",
      }),
    );

    const caseDoc = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return cases[0];
    });
    expect(caseDoc?.status).toBe("READY_FOR_JOINT");
  });

  it("sets isSolo=true on the case when requested", async () => {
    const t = await seedTemplate();
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "solo@test.com",
        isSolo: true,
      }),
    );

    const caseDoc = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return cases[0];
    });
    expect(caseDoc?.isSolo).toBe(true);
  });
});

// ── transitionCaseStatus ────────────────────────────────────────────────

describe("WOR-166: testSupport.transitionCaseStatus", () => {
  it("force-patches case status to the given value", async () => {
    const t = await seedTemplate();
    const caseId = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "transition@test.com",
      }),
    );

    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.transitionCaseStatus, {
        caseId,
        newStatus: "JOINT_ACTIVE",
      }),
    );

    const caseDoc = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return cases[0];
    });
    expect(caseDoc?.status).toBe("JOINT_ACTIVE");
  });

  it("skips state-machine validation — transitions directly to any status", async () => {
    const t = await seedTemplate();
    const caseId = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCase, {
        initiatorEmail: "skip-sm@test.com",
      }),
    );

    // Jump directly from DRAFT_PRIVATE_COACHING to CLOSED_RESOLVED
    // (normally invalid in the state machine)
    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.transitionCaseStatus, {
        caseId,
        newStatus: "CLOSED_RESOLVED",
      }),
    );

    const caseDoc = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return cases[0];
    });
    expect(caseDoc?.status).toBe("CLOSED_RESOLVED");
  });
});

// ── createTestCaseWithInvite ────────────────────────────────────────────

describe("WOR-166: testSupport.createTestCaseWithInvite", () => {
  it("creates a case and an ACTIVE invite token", async () => {
    const t = await seedTemplate();
    const result = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCaseWithInvite, {
        initiatorEmail: "invite-init@test.com",
      }),
    );

    expect(result).toHaveProperty("caseId");
    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("initiatorEmail");

    // Verify case exists
    const caseDoc = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return cases[0];
    });
    expect(caseDoc).toBeDefined();

    // Verify invite token exists with ACTIVE status
    const tokens = await t.run(async (ctx) =>
      ctx.db
        .query("inviteTokens")
        .withIndex("by_case", (q) => q.eq("caseId", result.caseId))
        .collect(),
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].status).toBe("ACTIVE");
  });

  it("returns a token string of length 32", async () => {
    const t = await seedTemplate();
    const result = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCaseWithInvite, {
        initiatorEmail: "token-len@test.com",
      }),
    );

    expect(typeof result.token).toBe("string");
    expect(result.token).toHaveLength(32);
  });

  it("returns the initiator email in the result", async () => {
    const t = await seedTemplate();
    const result = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCaseWithInvite, {
        initiatorEmail: "email-echo@test.com",
      }),
    );

    expect(result.initiatorEmail).toBe("email-echo@test.com");
  });
});

// ── consumeTestInvite ───────────────────────────────────────────────────

describe("WOR-166: testSupport.consumeTestInvite", () => {
  it("marks the invite token as CONSUMED", async () => {
    const t = await seedTemplate();
    const invite = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCaseWithInvite, {
        initiatorEmail: "consume-init@test.com",
      }),
    );

    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.consumeTestInvite, {
        token: invite.token,
        inviteeEmail: "consumer@test.com",
      }),
    );

    const tokens = await t.run(async (ctx) =>
      ctx.db
        .query("inviteTokens")
        .withIndex("by_case", (q) => q.eq("caseId", invite.caseId))
        .collect(),
    );
    expect(tokens[0].status).toBe("CONSUMED");
  });

  it("sets consumedByUserId on the token", async () => {
    const t = await seedTemplate();
    const invite = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCaseWithInvite, {
        initiatorEmail: "consume-uid-init@test.com",
      }),
    );

    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.consumeTestInvite, {
        token: invite.token,
        inviteeEmail: "uid-consumer@test.com",
      }),
    );

    const tokens = await t.run(async (ctx) =>
      ctx.db
        .query("inviteTokens")
        .withIndex("by_case", (q) => q.eq("caseId", invite.caseId))
        .collect(),
    );
    expect(tokens[0].consumedByUserId).toBeDefined();
  });

  it("patches the case inviteeUserId to the consuming user", async () => {
    const t = await seedTemplate();
    const invite = await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.createTestCaseWithInvite, {
        initiatorEmail: "patch-case-init@test.com",
      }),
    );

    await t.run(async (ctx) =>
      ctx.runMutation(internalApi.testSupport.consumeTestInvite, {
        token: invite.token,
        inviteeEmail: "patch-consumer@test.com",
      }),
    );

    const caseDoc = await t.run(async (ctx) => {
      const cases = await ctx.db.query("cases").collect();
      return cases[0];
    });
    expect(caseDoc?.inviteeUserId).toBeDefined();
  });
});
