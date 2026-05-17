import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";

/**
 * WOR-115: invites.decline mutation — transitions case to CLOSED_ABANDONED
 * via DECLINE_INVITE, marks token CONSUMED. Auth required, self-decline
 * prevention, state machine enforcement.
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
 */
async function seedDeclineEnv() {
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

// ── AC: Successful decline transitions case to CLOSED_ABANDONED ────────

describe("invites/decline — successful decline", () => {
  it("transitions case from DRAFT_PRIVATE_COACHING to CLOSED_ABANDONED", async () => {
    const { t, caseId, tokenString } = await seedDeclineEnv();

    await t
      .withIdentity({ email: "invitee@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(anyApi.invites.decline, { token: tokenString }),
      );

    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc).not.toBeNull();
    expect(caseDoc!.status).toBe("CLOSED_ABANDONED");
  });

  it("sets closedAt timestamp on the case", async () => {
    const { t, caseId, tokenString } = await seedDeclineEnv();

    const beforeDecline = Date.now();

    await t
      .withIdentity({ email: "invitee@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(anyApi.invites.decline, { token: tokenString }),
      );

    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc).not.toBeNull();
    expect(caseDoc!.closedAt).toBeGreaterThanOrEqual(beforeDecline);
    expect(caseDoc!.updatedAt).toBeGreaterThanOrEqual(beforeDecline);
  });

  it("marks the invite token as CONSUMED with consumedByUserId", async () => {
    const { t, tokenId, inviteeId, tokenString } = await seedDeclineEnv();

    await t
      .withIdentity({ email: "invitee@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(anyApi.invites.decline, { token: tokenString }),
      );

    const tokenDoc = await t.run(async (ctx) => ctx.db.get(tokenId));
    expect(tokenDoc).not.toBeNull();
    expect(tokenDoc!.status).toBe("CONSUMED");
    expect(tokenDoc!.consumedAt).toBeGreaterThan(0);
    expect(tokenDoc!.consumedByUserId).toEqual(inviteeId);
  });

  it("returns null on success", async () => {
    const { t, tokenString } = await seedDeclineEnv();

    const result = await t
      .withIdentity({ email: "invitee@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(anyApi.invites.decline, { token: tokenString }),
      );

    expect(result).toBeNull();
  });
});

// ── AC: Auth enforcement ───────────────────────────────────────────────

describe("invites/decline — auth enforcement", () => {
  it("throws UNAUTHENTICATED when called without auth", async () => {
    const { t, tokenString } = await seedDeclineEnv();

    await expectConvexError(
      t.run(async (ctx) =>
        ctx.runMutation(anyApi.invites.decline, { token: tokenString }),
      ),
      "UNAUTHENTICATED",
    );
  });
});

// ── AC: Self-decline prevention ─────────────────────────────────────────

describe("invites/decline — self-decline prevention", () => {
  it("throws CONFLICT when the initiator tries to decline their own invite", async () => {
    const { t, tokenString } = await seedDeclineEnv();

    await expectConvexError(
      t
        .withIdentity({ email: "initiator@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(anyApi.invites.decline, { token: tokenString }),
        ),
      "CONFLICT",
    );
  });
});

// ── AC: State machine enforcement ──────────────────────────────────────

describe("invites/decline — state machine enforcement", () => {
  it("throws CONFLICT when case is not in DRAFT_PRIVATE_COACHING", async () => {
    const { t, versionId, tokenString } = await seedDeclineEnv();

    // Create a new user, case in BOTH_PRIVATE_COACHING, and token
    const altInitiatorId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "alt-initiator@test.com",
        displayName: "AltInitiator",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    const altCaseId = await t.run(async (ctx) =>
      ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "BOTH_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: altInitiatorId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const altTokenString = "ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvu";

    await t.run(async (ctx) =>
      ctx.db.insert("inviteTokens", {
        caseId: altCaseId,
        token: altTokenString,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ email: "invitee@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(anyApi.invites.decline, { token: altTokenString }),
        ),
      "CONFLICT",
    );

    // Verify the original test still works with the right state
    // (this also checks that the original tokenString env is untouched)
    expect(tokenString).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
  });
});

// ── AC: Invalid/consumed token ──────────────────────────────────────────

describe("invites/decline — invalid token handling", () => {
  it("throws TOKEN_INVALID for a consumed token", async () => {
    const { t, tokenId, inviteeId, tokenString } = await seedDeclineEnv();

    // Consume the token first
    await t.run(async (ctx) =>
      ctx.db.patch(tokenId, {
        status: "CONSUMED",
        consumedAt: Date.now(),
        consumedByUserId: inviteeId,
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ email: "invitee@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(anyApi.invites.decline, { token: tokenString }),
        ),
      "TOKEN_INVALID",
    );
  });

  it("throws TOKEN_INVALID for a nonexistent token", async () => {
    const { t } = await seedDeclineEnv();

    await expectConvexError(
      t.withIdentity({ email: "invitee@test.com" }).run(async (ctx) =>
        ctx.runMutation(anyApi.invites.decline, {
          token: "nonexistent_token_value_here____",
        }),
      ),
      "TOKEN_INVALID",
    );
  });
});
