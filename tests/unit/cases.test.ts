import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

/**
 * WOR-111: Cases Convex module — create, get, list, partyStates queries +
 * mutations.
 *
 * Integration tests using convex-test with the project schema and generated
 * API FunctionReferences.
 */

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Asserts that a promise rejects with a ConvexError carrying the given code.
 */
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
 * Seeds a test environment with one user and one template (with a version).
 * Returns the convex-test client and created IDs.
 */
async function seedEnv(email: string, category = "workplace") {
  const t = convexTest(schema);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email,
      displayName: email.split("@")[0],
      role: "USER",
      createdAt: Date.now(),
    }),
  );
  const versionId = await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category,
      name: `${category} Template`,
      createdAt: Date.now(),
      createdByUserId: userId,
    });
    const vId = await ctx.db.insert("templateVersions", {
      templateId: tplId,
      version: 1,
      globalGuidance: "Test guidance",
      publishedAt: Date.now(),
      publishedByUserId: userId,
    });
    await ctx.db.patch(tplId, { currentVersionId: vId });
    return vId;
  });
  return { t, userId, versionId };
}

// ── AC: cases/list ──────────────────────────────────────────────────────

describe("cases/list query", () => {
  it("returns cases where caller is initiator or invitee, sorted by updatedAt desc", async () => {
    const { t, userId: userAId, versionId } = await seedEnv("a@test.com");
    const userBId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "b@test.com",
        displayName: "B",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    // Case 1: A is initiator (updatedAt = 1000)
    const case1Id = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        createdAt: 1000,
        updatedAt: 1000,
      }),
    );

    // Case 2: A is invitee (updatedAt = 2000)
    const case2Id = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "BOTH_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userBId,
        inviteeUserId: userAId,
        createdAt: 2000,
        updatedAt: 2000,
      }),
    );

    // Case 3: A is not a party
    await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userBId,
        createdAt: 3000,
        updatedAt: 3000,
      }),
    );

    const result = await t
      .withIdentity({ email: "a@test.com" })
      .run(async (ctx) => ctx.runQuery(api.cases.list, {}));

    expect(result).toHaveLength(2);
    expect(result[0]._id).toEqual(case2Id);
    expect(result[1]._id).toEqual(case1Id);
  });

  it("returns empty array when caller has no cases", async () => {
    const { t } = await seedEnv("lonely@test.com");

    const result = await t
      .withIdentity({ email: "lonely@test.com" })
      .run(async (ctx) => ctx.runQuery(api.cases.list, {}));

    expect(result).toEqual([]);
  });

  it("deduplicates solo cases appearing in both indexes", async () => {
    const { t, userId, versionId } = await seedEnv("solo-list@test.com");

    await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "BOTH_PRIVATE_COACHING",
        isSolo: true,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userId,
        inviteeUserId: userId,
        createdAt: 1000,
        updatedAt: 1000,
      }),
    );

    const result = await t
      .withIdentity({ email: "solo-list@test.com" })
      .run(async (ctx) => ctx.runQuery(api.cases.list, {}));

    expect(result).toHaveLength(1);
  });
});

// ── AC: cases/get ───────────────────────────────────────────────────────

describe("cases/get query", () => {
  it("returns full case document when caller is a party", async () => {
    const { t, userId, versionId } = await seedEnv("party@test.com");
    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const result = await t
      .withIdentity({ email: "party@test.com" })
      .run(async (ctx) => ctx.runQuery(api.cases.get, { caseId }));

    expect(result._id).toEqual(caseId);
    expect(result.status).toBe("DRAFT_PRIVATE_COACHING");
    expect(result.initiatorUserId).toEqual(userId);
  });

  it("throws FORBIDDEN when caller is not a party", async () => {
    const { t, userId, versionId } = await seedEnv("owner@test.com");
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "stranger@test.com",
        displayName: "stranger",
        role: "USER",
        createdAt: Date.now(),
      }),
    );
    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ email: "stranger@test.com" })
        .run(async (ctx) => ctx.runQuery(api.cases.get, { caseId })),
      "FORBIDDEN",
    );
  });
});

// ── AC: cases/partyStates ───────────────────────────────────────────────

describe("cases/partyStates query", () => {
  it("returns caller's full partyState and other's phase-level-only view", async () => {
    const {
      t,
      userId: userAId,
      versionId,
    } = await seedEnv("initiator@test.com");
    const userBId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "invitee@test.com",
        displayName: "invitee",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "BOTH_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        inviteeUserId: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("partyStates", {
        caseId,
        userId: userAId,
        role: "INITIATOR",
        mainTopic: "Topic A",
        description: "Desc A",
        desiredOutcome: "Outcome A",
        formCompletedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId,
        userId: userBId,
        role: "INVITEE",
        mainTopic: "Secret Topic B",
        description: "Secret Desc B",
        desiredOutcome: "Secret Outcome B",
        formCompletedAt: Date.now(),
        privateCoachingCompletedAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity({ email: "initiator@test.com" })
      .run(async (ctx) => ctx.runQuery(api.cases.partyStates, { caseId }));

    // Self has full fields
    expect(result.self.role).toBe("INITIATOR");
    expect(result.self.mainTopic).toBe("Topic A");
    expect(result.self.description).toBe("Desc A");
    expect(result.self.desiredOutcome).toBe("Outcome A");

    // Other has only role + hasCompletedPC
    expect(result.other).not.toBeNull();
    expect(result.other!.role).toBe("INVITEE");
    expect(result.other!.hasCompletedPC).toBe(true);

    // Other must NOT have form content or other private fields
    const otherKeys = Object.keys(result.other!);
    expect(otherKeys).toContain("role");
    expect(otherKeys).toContain("hasCompletedPC");
    expect(otherKeys).not.toContain("mainTopic");
    expect(otherKeys).not.toContain("description");
    expect(otherKeys).not.toContain("desiredOutcome");
    expect(otherKeys).not.toContain("synthesisText");
    expect(otherKeys).not.toContain("formCompletedAt");
    expect(otherKeys).not.toContain("privateCoachingCompletedAt");
  });

  it("returns null for other when invitee has not joined", async () => {
    const { t, userId, versionId } = await seedEnv("alone@test.com");
    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("partyStates", {
        caseId,
        userId,
        role: "INITIATOR",
        mainTopic: "Topic",
        description: "Desc",
        desiredOutcome: "Outcome",
      });
    });

    const result = await t
      .withIdentity({ email: "alone@test.com" })
      .run(async (ctx) => ctx.runQuery(api.cases.partyStates, { caseId }));

    expect(result.self.role).toBe("INITIATOR");
    expect(result.other).toBeNull();
  });
});

// ── AC: cases/create standard mode ──────────────────────────────────────

describe("cases/create mutation — standard mode", () => {
  it("creates case with DRAFT_PRIVATE_COACHING, initiator partyState, and invite token", async () => {
    const { t, userId } = await seedEnv("creator@test.com");

    const result = await t
      .withIdentity({ email: "creator@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.cases.create, {
          category: "workplace",
          mainTopic: "Conflict topic",
          description: "Conflict description",
          desiredOutcome: "Resolution",
        }),
      );

    expect(result.caseId).toBeDefined();
    expect(result.inviteUrl).not.toBeNull();
    expect(result.inviteUrl).toContain("/invite/");

    // Verify case document (query by table to get properly typed Doc<"cases">)
    const allCases = await t.run(async (ctx) =>
      ctx.db.query("cases").collect(),
    );
    expect(allCases).toHaveLength(1);
    const caseDoc = allCases[0];
    expect(caseDoc.status).toBe("DRAFT_PRIVATE_COACHING");
    expect(caseDoc.schemaVersion).toBe(1);
    expect(caseDoc.isSolo).toBe(false);
    expect(caseDoc.category).toBe("workplace");
    expect(caseDoc.initiatorUserId).toEqual(userId);
    expect(caseDoc.inviteeUserId).toBeUndefined();
    expect(caseDoc.createdAt).toBeGreaterThan(0);
    expect(caseDoc.updatedAt).toBeGreaterThan(0);

    // Verify initiator partyState
    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", result.caseId))
        .collect(),
    );
    expect(psRows).toHaveLength(1);
    expect(psRows[0].role).toBe("INITIATOR");
    expect(psRows[0].userId).toEqual(userId);
    expect(psRows[0].mainTopic).toBe("Conflict topic");
    expect(psRows[0].description).toBe("Conflict description");
    expect(psRows[0].desiredOutcome).toBe("Resolution");
    expect(psRows[0].formCompletedAt).toBeGreaterThan(0);

    // Verify invite token
    const tokens = await t.run(async (ctx) =>
      ctx.db
        .query("inviteTokens")
        .withIndex("by_case", (q) => q.eq("caseId", result.caseId))
        .collect(),
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].status).toBe("ACTIVE");
    expect(tokens[0].token.length).toBe(32);
  });
});

// ── AC: cases/create solo mode ──────────────────────────────────────────

describe("cases/create mutation — solo mode", () => {
  it("creates case with BOTH_PRIVATE_COACHING, two partyStates, no invite", async () => {
    const { t, userId } = await seedEnv("solo@test.com", "personal");

    const result = await t
      .withIdentity({ email: "solo@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.cases.create, {
          category: "personal",
          mainTopic: "Solo topic",
          description: "Solo desc",
          desiredOutcome: "Solo outcome",
          isSolo: true,
        }),
      );

    expect(result.caseId).toBeDefined();
    expect(result.inviteUrl).toBeNull();

    // Verify case (query by table for typed Doc<"cases">)
    const allCases = await t.run(async (ctx) =>
      ctx.db.query("cases").collect(),
    );
    expect(allCases).toHaveLength(1);
    const caseDoc = allCases[0];
    expect(caseDoc.status).toBe("BOTH_PRIVATE_COACHING");
    expect(caseDoc.isSolo).toBe(true);
    expect(caseDoc.initiatorUserId).toEqual(userId);
    expect(caseDoc.inviteeUserId).toEqual(userId);

    // Verify two partyStates (INITIATOR + INVITEE), both for the same user
    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", result.caseId))
        .collect(),
    );
    expect(psRows).toHaveLength(2);
    const roles = psRows.map((ps) => ps.role).sort();
    expect(roles).toEqual(["INITIATOR", "INVITEE"]);
    expect(psRows[0].userId).toEqual(userId);
    expect(psRows[1].userId).toEqual(userId);

    // Verify no invite token
    const tokens = await t.run(async (ctx) =>
      ctx.db
        .query("inviteTokens")
        .withIndex("by_case", (q) => q.eq("caseId", result.caseId))
        .collect(),
    );
    expect(tokens).toHaveLength(0);
  });
});

// ── AC: Template pinning ────────────────────────────────────────────────

describe("cases/create pins templateVersionId at creation time", () => {
  it("sets templateVersionId to category's current active version", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "pin@test.com",
        displayName: "pin",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    // Create template with version 1, then publish version 2
    const version2Id = await t.run(async (ctx) => {
      const tplId = await ctx.db.insert("templates", {
        category: "family",
        name: "Family",
        createdAt: Date.now(),
        createdByUserId: userId,
      });
      await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 1,
        globalGuidance: "v1",
        publishedAt: Date.now(),
        publishedByUserId: userId,
      });
      const v2Id = await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 2,
        globalGuidance: "v2",
        publishedAt: Date.now(),
        publishedByUserId: userId,
      });
      await ctx.db.patch(tplId, { currentVersionId: v2Id });
      return v2Id;
    });

    await t.withIdentity({ email: "pin@test.com" }).run(async (ctx) =>
      ctx.runMutation(api.cases.create, {
        category: "family",
        mainTopic: "Topic",
        description: "Desc",
        desiredOutcome: "Outcome",
      }),
    );

    const allCases = await t.run(async (ctx) =>
      ctx.db.query("cases").collect(),
    );
    expect(allCases).toHaveLength(1);
    expect(allCases[0].templateVersionId).toEqual(version2Id);
  });

  it("throws INVALID_INPUT when category has no template", async () => {
    const { t } = await seedEnv("notemplate@test.com");

    await expectConvexError(
      t.withIdentity({ email: "notemplate@test.com" }).run(async (ctx) =>
        ctx.runMutation(api.cases.create, {
          category: "nonexistent",
          mainTopic: "Topic",
          description: "Desc",
          desiredOutcome: "Outcome",
        }),
      ),
      "INVALID_INPUT",
    );
  });
});

// ── AC: cases/updateMyForm ──────────────────────────────────────────────

describe("cases/updateMyForm mutation", () => {
  it("updates partyStates form fields and refreshes cases.updatedAt", async () => {
    const { t, userId } = await seedEnv("updater@test.com");

    const created = await t
      .withIdentity({ email: "updater@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.cases.create, {
          category: "workplace",
          mainTopic: "Original topic",
          description: "Original desc",
          desiredOutcome: "Original outcome",
        }),
      );

    const casesBefore = await t.run(async (ctx) =>
      ctx.db.query("cases").collect(),
    );
    const updatedAtBefore = casesBefore[0].updatedAt;

    await t.withIdentity({ email: "updater@test.com" }).run(async (ctx) =>
      ctx.runMutation(api.cases.updateMyForm, {
        caseId: created.caseId,
        mainTopic: "Updated topic",
        description: "Updated desc",
        desiredOutcome: "Updated outcome",
      }),
    );

    // Verify form fields updated
    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", created.caseId).eq("userId", userId),
        )
        .collect(),
    );
    expect(psRows).toHaveLength(1);
    expect(psRows[0].mainTopic).toBe("Updated topic");
    expect(psRows[0].description).toBe("Updated desc");
    expect(psRows[0].desiredOutcome).toBe("Updated outcome");

    // Verify cases.updatedAt refreshed
    const casesAfter = await t.run(async (ctx) =>
      ctx.db.query("cases").collect(),
    );
    expect(casesAfter[0].updatedAt).toBeGreaterThanOrEqual(updatedAtBefore);
  });

  it("does not modify case status (state machine: updateMyForm is not a transition)", async () => {
    const { t } = await seedEnv("sm@test.com");

    const created = await t
      .withIdentity({ email: "sm@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.cases.create, {
          category: "workplace",
          mainTopic: "Topic",
          description: "Desc",
          desiredOutcome: "Outcome",
        }),
      );

    const casesBefore = await t.run(async (ctx) =>
      ctx.db.query("cases").collect(),
    );
    const statusBefore = casesBefore[0].status;

    await t.withIdentity({ email: "sm@test.com" }).run(async (ctx) =>
      ctx.runMutation(api.cases.updateMyForm, {
        caseId: created.caseId,
        mainTopic: "New Topic",
        description: "New Desc",
        desiredOutcome: "New Outcome",
      }),
    );

    const casesAfter = await t.run(async (ctx) =>
      ctx.db.query("cases").collect(),
    );
    expect(casesAfter[0].status).toBe(statusBefore);
  });
});

// ── AC: Auth enforcement ────────────────────────────────────────────────

describe("all functions enforce auth via requireAuth", () => {
  it("list throws UNAUTHENTICATED without auth", async () => {
    const { t } = await seedEnv("auth-list@test.com");

    await expectConvexError(
      t.run(async (ctx) => ctx.runQuery(api.cases.list, {})),
      "UNAUTHENTICATED",
    );
  });

  it("get throws UNAUTHENTICATED without auth", async () => {
    const { t, userId, versionId } = await seedEnv("auth-get@test.com");
    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expectConvexError(
      t.run(async (ctx) => ctx.runQuery(api.cases.get, { caseId })),
      "UNAUTHENTICATED",
    );
  });

  it("partyStates throws UNAUTHENTICATED without auth", async () => {
    const { t, userId, versionId } = await seedEnv("auth-ps@test.com");
    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expectConvexError(
      t.run(async (ctx) => ctx.runQuery(api.cases.partyStates, { caseId })),
      "UNAUTHENTICATED",
    );
  });

  it("create throws UNAUTHENTICATED without auth", async () => {
    const { t } = await seedEnv("auth-create@test.com");

    await expectConvexError(
      t.run(async (ctx) =>
        ctx.runMutation(api.cases.create, {
          category: "workplace",
          mainTopic: "T",
          description: "D",
          desiredOutcome: "O",
        }),
      ),
      "UNAUTHENTICATED",
    );
  });

  it("updateMyForm throws UNAUTHENTICATED without auth", async () => {
    const { t, userId, versionId } = await seedEnv("auth-update@test.com");
    const caseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expectConvexError(
      t.run(async (ctx) =>
        ctx.runMutation(api.cases.updateMyForm, {
          caseId,
          mainTopic: "T",
          description: "D",
          desiredOutcome: "O",
        }),
      ),
      "UNAUTHENTICATED",
    );
  });
});
