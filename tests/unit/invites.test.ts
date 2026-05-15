import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";
import { generateToken, buildInviteUrl } from "../../convex/invites";

/**
 * WOR-112: Invite Convex module — token generation + redeem mutation.
 *
 * Unit and integration tests using convex-test with the project schema
 * and generated API FunctionReferences.
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
 * Seeds a test environment with two users, a template/version, a case in
 * DRAFT_PRIVATE_COACHING, an initiator partyState, and an ACTIVE invite token.
 * Returns the convex-test client and all created IDs.
 */
async function seedInviteEnv() {
  const t = convexTest(schema);

  const initiatorId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "initiator@test.com",
      displayName: "Initiator",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const inviteeId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "invitee@test.com",
      displayName: "Invitee",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const versionId = await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category: "workplace",
      name: "Workplace Template",
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
      category: "workplace",
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
      mainTopic: "Topic",
      description: "Desc",
      desiredOutcome: "Outcome",
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

  return { t, initiatorId, inviteeId, versionId, caseId, tokenId, tokenString };
}

// ── AC: Token generation (32 url-safe chars, crypto-random) ─────────────

describe("generateToken — pure function", () => {
  it("produces exactly 32 url-safe characters per invocation", () => {
    const tokens: string[] = [];
    for (let i = 0; i < 100; i++) {
      tokens.push(generateToken());
    }

    for (const token of tokens) {
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  it("produces unique tokens across 100 invocations", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken());
    }
    expect(tokens.size).toBe(100);
  });
});

// ── AC: Invite URL format ───────────────────────────────────────────────

describe("buildInviteUrl — pure function", () => {
  it("returns {SITE_URL}/invite/{token} with default localhost fallback", () => {
    const url = buildInviteUrl("abc123");
    expect(url).toBe("http://localhost:5173/invite/abc123");
  });

  it("includes the token verbatim in the URL path", () => {
    const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    const url = buildInviteUrl(token);
    expect(url).toContain(`/invite/${token}`);
  });
});

// ── AC: Atomic redeem — validates token, sets invitee, creates partyState,
//        marks token CONSUMED ────────────────────────────────────────────

describe("invites/redeem mutation — successful redemption", () => {
  it("atomically binds invitee to case, creates partyState, and consumes token", async () => {
    const { t, inviteeId, caseId, tokenString } = await seedInviteEnv();

    const result = await t
      .withIdentity({ email: "invitee@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(anyApi.invites.redeem, { token: tokenString }),
      );

    // Returns the caseId
    expect(result.caseId).toEqual(caseId);

    // Verify cases.inviteeUserId is set to caller
    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc).not.toBeNull();
    expect(caseDoc!.inviteeUserId).toEqual(inviteeId);
    expect(caseDoc!.updatedAt).toBeGreaterThan(0);

    // Verify partyStates row created for invitee with role=INVITEE
    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", inviteeId),
        )
        .collect(),
    );
    expect(psRows).toHaveLength(1);
    expect(psRows[0].role).toBe("INVITEE");
    expect(psRows[0].userId).toEqual(inviteeId);
    expect(psRows[0].caseId).toEqual(caseId);
    // No form fields set yet — invitee fills form after redeeming
    expect(psRows[0].mainTopic).toBeUndefined();
    expect(psRows[0].description).toBeUndefined();
    expect(psRows[0].desiredOutcome).toBeUndefined();

    // Verify inviteTokens status is CONSUMED with consumedAt and consumedByUserId
    const tokenRows = await t.run(async (ctx) =>
      ctx.db
        .query("inviteTokens")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0].status).toBe("CONSUMED");
    expect(tokenRows[0].consumedAt).toBeGreaterThan(0);
    expect(tokenRows[0].consumedByUserId).toEqual(inviteeId);
  });
});

// ── AC: Case status unchanged after redeem ──────────────────────────────

describe("invites/redeem — case status invariant", () => {
  it("does NOT change case status — remains DRAFT_PRIVATE_COACHING after redeem", async () => {
    const { t, caseId, tokenString } = await seedInviteEnv();

    await t
      .withIdentity({ email: "invitee@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(anyApi.invites.redeem, { token: tokenString }),
      );

    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc).not.toBeNull();
    expect(caseDoc!.status).toBe("DRAFT_PRIVATE_COACHING");
  });
});

// ── AC: Reusing a consumed token throws TOKEN_INVALID ───────────────────

describe("invites/redeem — consumed token", () => {
  it("throws TOKEN_INVALID when token has already been consumed", async () => {
    const { t, tokenString } = await seedInviteEnv();

    // First redemption succeeds
    await t
      .withIdentity({ email: "invitee@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(anyApi.invites.redeem, { token: tokenString }),
      );

    // Create a third user to attempt second redemption
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "thirdparty@test.com",
        displayName: "Third",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    // Second redemption throws TOKEN_INVALID
    await expectConvexError(
      t
        .withIdentity({ email: "thirdparty@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(anyApi.invites.redeem, { token: tokenString }),
        ),
      "TOKEN_INVALID",
    );
  });

  it("throws TOKEN_INVALID when token does not exist", async () => {
    const { t } = await seedInviteEnv();

    await expectConvexError(
      t
        .withIdentity({ email: "invitee@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(anyApi.invites.redeem, {
            token: "nonexistent_token_value_here____",
          }),
        ),
      "TOKEN_INVALID",
    );
  });
});

// ── AC: Initiator self-redeem throws CONFLICT ───────────────────────────

describe("invites/redeem — self-redeem prevention", () => {
  it("throws CONFLICT when the initiator tries to redeem their own invite", async () => {
    const { t, tokenString } = await seedInviteEnv();

    await expectConvexError(
      t
        .withIdentity({ email: "initiator@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(anyApi.invites.redeem, { token: tokenString }),
        ),
      "CONFLICT",
    );
  });
});

// ── Auth enforcement ────────────────────────────────────────────────────

describe("invites/redeem — auth enforcement", () => {
  it("throws UNAUTHENTICATED without auth", async () => {
    const { t, tokenString } = await seedInviteEnv();

    await expectConvexError(
      t.run(async (ctx) =>
        ctx.runMutation(anyApi.invites.redeem, { token: tokenString }),
      ),
      "UNAUTHENTICATED",
    );
  });
});
