import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";

/**
 * WOR-114: invites.getForCase query — returns active invite token URL
 * for the case initiator.
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
 * Seeds a test environment with a user, template, case, partyState,
 * and an active invite token.
 */
async function seedGetForCaseEnv() {
  const t = convexTest(schema);

  const initiatorId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "initiator@test.com",
      displayName: "Initiator",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const nonInitiatorId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "other@test.com",
      displayName: "Other",
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

  return { t, initiatorId, nonInitiatorId, caseId, tokenId, tokenString };
}

// ── AC: Returns { token, url } for active invite when called by initiator ──

describe("invites/getForCase — successful retrieval", () => {
  it("returns token and url for an active invite when called by the initiator", async () => {
    const { t, caseId, tokenString } = await seedGetForCaseEnv();

    const result = await t
      .withIdentity({ email: "initiator@test.com" })
      .run(async (ctx) => ctx.runQuery(anyApi.invites.getForCase, { caseId }));

    expect(result).not.toBeNull();
    expect(result!.token).toBe(tokenString);
    expect(result!.url).toContain(`/invite/${tokenString}`);
  });
});

// ── AC: Returns null when token has been consumed ───────────────────────

describe("invites/getForCase — consumed token", () => {
  it("returns null when the invite token has been consumed", async () => {
    const { t, caseId, tokenId, nonInitiatorId } = await seedGetForCaseEnv();

    // Mark the token as consumed
    await t.run(async (ctx) =>
      ctx.db.patch(tokenId, {
        status: "CONSUMED",
        consumedAt: Date.now(),
        consumedByUserId: nonInitiatorId,
      }),
    );

    const result = await t
      .withIdentity({ email: "initiator@test.com" })
      .run(async (ctx) => ctx.runQuery(anyApi.invites.getForCase, { caseId }));

    expect(result).toBeNull();
  });
});

// ── AC: Throws UNAUTHENTICATED for unauthenticated callers ──────────────

describe("invites/getForCase — auth enforcement", () => {
  it("throws UNAUTHENTICATED when called without auth", async () => {
    const { t, caseId } = await seedGetForCaseEnv();

    await expectConvexError(
      t.run(async (ctx) => ctx.runQuery(anyApi.invites.getForCase, { caseId })),
      "UNAUTHENTICATED",
    );
  });
});

// ── AC: Throws FORBIDDEN for non-initiator ──────────────────────────────

describe("invites/getForCase — initiator-only access", () => {
  it("throws FORBIDDEN when called by a user who is not the case initiator", async () => {
    const { t, caseId } = await seedGetForCaseEnv();

    await expectConvexError(
      t
        .withIdentity({ email: "other@test.com" })
        .run(async (ctx) =>
          ctx.runQuery(anyApi.invites.getForCase, { caseId }),
        ),
      "FORBIDDEN",
    );
  });
});
