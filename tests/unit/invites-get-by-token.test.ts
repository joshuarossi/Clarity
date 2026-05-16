import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";

/**
 * WOR-115: invites.getByToken query — returns invite preview data
 * without requiring authentication. Privacy boundary: never returns
 * description or desiredOutcome.
 */

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Seeds a test environment with a user, template/version, case,
 * initiator partyState (with private fields), and an ACTIVE invite token.
 */
async function seedGetByTokenEnv() {
  const t = convexTest(schema);

  const initiatorId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "initiator@test.com",
      displayName: "Alex",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const versionId = await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category: "personal",
      name: "Personal Template",
      createdAt: Date.now(),
      createdByUserId: initiatorId,
    });
    const vId = await ctx.db.insert("templateVersions", {
      templateId: tplId,
      version: 1,
      globalGuidance: "Test guidance",
      publishedAt: Date.now(),
      publishedByUserId: initiatorId,
    });
    await ctx.db.patch(tplId, { currentVersionId: vId });
    return vId;
  });

  const caseId = await t.run(async (ctx) =>
    ctx.db.insert("cases", {
      schemaVersion: 1,
      status: "DRAFT_PRIVATE_COACHING",
      isSolo: false,
      category: "personal",
      templateVersionId: versionId,
      initiatorUserId: initiatorId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

  await t.run(async (ctx) =>
    ctx.db.insert("partyStates", {
      caseId,
      userId: initiatorId,
      role: "INITIATOR",
      mainTopic: "How we split household chores",
      description: "Private description that should never be returned",
      desiredOutcome: "Private outcome that should never be returned",
      formCompletedAt: Date.now(),
    }),
  );

  const tokenString = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";

  const tokenId = await t.run(async (ctx) =>
    ctx.db.insert("inviteTokens", {
      caseId,
      token: tokenString,
      status: "ACTIVE",
      createdAt: Date.now(),
    }),
  );

  return { t, initiatorId, caseId, tokenId, tokenString };
}

// ── AC: Returns ACTIVE with preview fields for valid active token ──────

describe("invites/getByToken — active token", () => {
  it("returns ACTIVE with initiatorName, mainTopic, category, and caseId", async () => {
    const { t, caseId, tokenString } = await seedGetByTokenEnv();

    const result = await t.run(async (ctx) =>
      ctx.runQuery(anyApi.invites.getByToken, { token: tokenString }),
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe("ACTIVE");
    expect(result!.initiatorName).toBe("Alex");
    expect(result!.mainTopic).toBe("How we split household chores");
    expect(result!.category).toBe("personal");
    expect(result!.caseId).toEqual(caseId);
  });
});

// ── AC: Returns CONSUMED for consumed token ────────────────────────────

describe("invites/getByToken — consumed token", () => {
  it("returns { status: 'CONSUMED' } for a consumed token", async () => {
    const { t, tokenId, initiatorId, tokenString } = await seedGetByTokenEnv();

    // Mark token as consumed
    await t.run(async (ctx) =>
      ctx.db.patch(tokenId, {
        status: "CONSUMED",
        consumedAt: Date.now(),
        consumedByUserId: initiatorId,
      }),
    );

    const result = await t.run(async (ctx) =>
      ctx.runQuery(anyApi.invites.getByToken, { token: tokenString }),
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe("CONSUMED");
    // Should NOT contain preview fields for consumed tokens
    expect("initiatorName" in result!).toBe(false);
    expect("mainTopic" in result!).toBe(false);
  });
});

// ── AC: Returns null for nonexistent token ─────────────────────────────

describe("invites/getByToken — nonexistent token", () => {
  it("returns null for a token string that does not exist", async () => {
    const { t } = await seedGetByTokenEnv();

    const result = await t.run(async (ctx) =>
      ctx.runQuery(anyApi.invites.getByToken, {
        token: "nonexistent_token_value_here____",
      }),
    );

    expect(result).toBeNull();
  });
});

// ── AC: Does NOT require auth ──────────────────────────────────────────

describe("invites/getByToken — no auth required", () => {
  it("returns data when called without any user identity", async () => {
    const { t, tokenString } = await seedGetByTokenEnv();

    // Call without .withIdentity() — no auth
    const result = await t.run(async (ctx) =>
      ctx.runQuery(anyApi.invites.getByToken, { token: tokenString }),
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe("ACTIVE");
    expect(result!.initiatorName).toBe("Alex");
  });
});

// ── AC: Privacy invariant — no description or desiredOutcome ───────────

describe("invites/getByToken — privacy boundary", () => {
  it("does NOT include description or desiredOutcome in the return value", async () => {
    const { t, tokenString } = await seedGetByTokenEnv();

    const result = await t.run(async (ctx) =>
      ctx.runQuery(anyApi.invites.getByToken, { token: tokenString }),
    );

    expect(result).not.toBeNull();
    const keys = Object.keys(result!);
    expect(keys).not.toContain("description");
    expect(keys).not.toContain("desiredOutcome");
  });

  it("does NOT include any private message data", async () => {
    const { t, tokenString } = await seedGetByTokenEnv();

    const result = await t.run(async (ctx) =>
      ctx.runQuery(anyApi.invites.getByToken, { token: tokenString }),
    );

    expect(result).not.toBeNull();
    const keys = Object.keys(result!);
    expect(keys).not.toContain("privateMessages");
    expect(keys).not.toContain("content");
  });
});
