import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";

// Use anyApi instead of the generated typed api because privateCoaching
// does not exist yet — it will be created by the implementation agent.
// anyApi is Convex's untyped API reference that accepts any property path.
const api = anyApi;

/**
 * WOR-117: Private coaching Convex module — queries + mutations.
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
 * Seeds a test environment with two users, a template, a case in
 * BOTH_PRIVATE_COACHING status, and partyStates for both users.
 */
async function seedTwoPartyEnv() {
  const t = convexTest(schema);

  const userAId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "usera@test.com",
      displayName: "User A",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const userBId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "userb@test.com",
      displayName: "User B",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const { versionId, caseId } = await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category: "workplace",
      name: "Workplace Template",
      createdAt: Date.now(),
      createdByUserId: userAId,
    });
    const vId = await ctx.db.insert("templateVersions", {
      templateId: tplId,
      version: 1,
      globalGuidance: "Test guidance",
      publishedAt: Date.now(),
      publishedByUserId: userAId,
    });
    await ctx.db.patch(tplId, { currentVersionId: vId });

    const cId = await ctx.db.insert("cases", {
      schemaVersion: 1,
      status: "BOTH_PRIVATE_COACHING",
      isSolo: false,
      category: "workplace",
      templateVersionId: vId,
      initiatorUserId: userAId,
      inviteeUserId: userBId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userAId,
      role: "INITIATOR",
      mainTopic: "Topic A",
      description: "Desc A",
      desiredOutcome: "Outcome A",
      formCompletedAt: Date.now(),
    });

    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userBId,
      role: "INVITEE",
      mainTopic: "Topic B",
      description: "Desc B",
      desiredOutcome: "Outcome B",
      formCompletedAt: Date.now(),
    });

    return { versionId: vId, caseId: cId };
  });

  return { t, userAId, userBId, versionId, caseId };
}

// ── AC 1 + AC 8: myMessages caller-only visibility ─────────────────────

describe("privateCoaching/myMessages — caller-only visibility", () => {
  it("returns only the caller's messages, never another user's", async () => {
    const { t, userAId, userBId, caseId } = await seedTwoPartyEnv();

    // Seed messages for both users
    await t.run(async (ctx) => {
      await ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "USER",
        content: "Message from A",
        status: "COMPLETE",
        createdAt: 1000,
      });
      await ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "AI",
        content: "AI reply to A",
        status: "COMPLETE",
        createdAt: 2000,
      });
      await ctx.db.insert("privateMessages", {
        caseId,
        userId: userBId,
        role: "USER",
        content: "Message from B",
        status: "COMPLETE",
        createdAt: 3000,
      });
    });

    // User A sees only their messages
    const resultA = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runQuery(api.privateCoaching.myMessages, { caseId }),
      );

    expect(resultA).toHaveLength(2);
    expect(resultA[0].content).toBe("Message from A");
    expect(resultA[1].content).toBe("AI reply to A");

    // User B sees only their messages
    const resultB = await t
      .withIdentity({ email: "userb@test.com" })
      .run(async (ctx) =>
        ctx.runQuery(api.privateCoaching.myMessages, { caseId }),
      );

    expect(resultB).toHaveLength(1);
    expect(resultB[0].content).toBe("Message from B");
  });

  it("returns empty array for a non-party user (not FORBIDDEN)", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnv();

    // Create a non-party user
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "stranger@test.com",
        displayName: "Stranger",
        role: "USER",
        createdAt: Date.now(),
      });
      // Seed a message so we can verify it's not returned
      await ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "USER",
        content: "Private message",
        status: "COMPLETE",
        createdAt: 1000,
      });
    });

    const result = await t
      .withIdentity({ email: "stranger@test.com" })
      .run(async (ctx) =>
        ctx.runQuery(api.privateCoaching.myMessages, { caseId }),
      );

    expect(result).toEqual([]);
  });

  it("returns empty array for a party with no messages yet", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    const result = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runQuery(api.privateCoaching.myMessages, { caseId }),
      );

    expect(result).toEqual([]);
  });
});

// ── AC 2: myMessages sort order ────────────────────────────────────────

describe("privateCoaching/myMessages — sort order", () => {
  it("returns messages sorted by createdAt ascending", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnv();

    // Insert messages with out-of-order createdAt
    await t.run(async (ctx) => {
      await ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "USER",
        content: "Third (createdAt=3000)",
        status: "COMPLETE",
        createdAt: 3000,
      });
      await ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "USER",
        content: "First (createdAt=1000)",
        status: "COMPLETE",
        createdAt: 1000,
      });
      await ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "AI",
        content: "Second (createdAt=2000)",
        status: "COMPLETE",
        createdAt: 2000,
      });
    });

    const result = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runQuery(api.privateCoaching.myMessages, { caseId }),
      );

    expect(result).toHaveLength(3);
    expect(result[0].createdAt).toBe(1000);
    expect(result[1].createdAt).toBe(2000);
    expect(result[2].createdAt).toBe(3000);
  });
});

// ── AC 3: sendUserMessage inserts + schedules ──────────────────────────

describe("privateCoaching/sendUserMessage — insert + schedule", () => {
  it("inserts a privateMessages row with role=USER, status=COMPLETE and schedules generateAIResponse", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnv();

    const messageId = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.sendUserMessage, {
          caseId,
          content: "Hello coach",
        }),
      );

    expect(messageId).toBeDefined();

    // Verify the inserted message
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("USER");
    expect(messages[0].status).toBe("COMPLETE");
    expect(messages[0].content).toBe("Hello coach");
    expect(messages[0].userId).toEqual(userAId);
    expect(messages[0].caseId).toEqual(caseId);
    expect(messages[0].createdAt).toBeGreaterThan(0);

    // Verify generateAIResponse was scheduled via ctx.scheduler.runAfter
    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateAIResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("privateCoaching") &&
        job.name.includes("generateAIResponse"),
    );
    expect(
      generateAIResponseJob,
      "Expected generateAIResponse to be scheduled after sendUserMessage",
    ).toBeDefined();
    expect(generateAIResponseJob!.args).toEqual([
      { caseId, userId: userAId },
    ]);
  });
});

// ── AC 4: sendUserMessage status validation ────────────────────────────

describe("privateCoaching/sendUserMessage — status validation", () => {
  it("succeeds when case status is DRAFT_PRIVATE_COACHING", async () => {
    const t = convexTest(schema);

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "draft@test.com",
        displayName: "Draft User",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    const caseId = await t.run(async (ctx) => {
      const tplId = await ctx.db.insert("templates", {
        category: "workplace",
        name: "WP",
        createdAt: Date.now(),
        createdByUserId: userId,
      });
      const vId = await ctx.db.insert("templateVersions", {
        templateId: tplId,
        version: 1,
        globalGuidance: "g",
        publishedAt: Date.now(),
        publishedByUserId: userId,
      });
      await ctx.db.patch(tplId, { currentVersionId: vId });

      const cId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "DRAFT_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: vId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId,
        role: "INITIATOR",
      });
      return cId;
    });

    const messageId = await t
      .withIdentity({ email: "draft@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.sendUserMessage, {
          caseId,
          content: "Draft phase message",
        }),
      );

    expect(messageId).toBeDefined();
  });

  it("succeeds when case status is BOTH_PRIVATE_COACHING", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    const messageId = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.sendUserMessage, {
          caseId,
          content: "Both phase message",
        }),
      );

    expect(messageId).toBeDefined();
  });

  it("throws CONFLICT when case status is READY_FOR_JOINT", async () => {
    const { t, caseId } = await seedTwoPartyEnv();
    await t.run(async (ctx) => {
      const caseDoc = await ctx.db.get(caseId);
      await ctx.db.patch(caseDoc!._id, { status: "READY_FOR_JOINT" });
    });

    await expectConvexError(
      t
        .withIdentity({ email: "usera@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(api.privateCoaching.sendUserMessage, {
            caseId,
            content: "Should fail",
          }),
        ),
      "CONFLICT",
    );
  });

  it("throws CONFLICT when case status is JOINT_ACTIVE", async () => {
    const { t, caseId } = await seedTwoPartyEnv();
    await t.run(async (ctx) => {
      await ctx.db.patch(caseId, { status: "JOINT_ACTIVE" });
    });

    await expectConvexError(
      t
        .withIdentity({ email: "usera@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(api.privateCoaching.sendUserMessage, {
            caseId,
            content: "Should fail",
          }),
        ),
      "CONFLICT",
    );
  });

  it("throws CONFLICT when case status is CLOSED_RESOLVED", async () => {
    const { t, caseId } = await seedTwoPartyEnv();
    await t.run(async (ctx) => {
      await ctx.db.patch(caseId, { status: "CLOSED_RESOLVED" });
    });

    await expectConvexError(
      t
        .withIdentity({ email: "usera@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(api.privateCoaching.sendUserMessage, {
            caseId,
            content: "Should fail",
          }),
        ),
      "CONFLICT",
    );
  });

  it("throws CONFLICT when case status is CLOSED_UNRESOLVED", async () => {
    const { t, caseId } = await seedTwoPartyEnv();
    await t.run(async (ctx) => {
      await ctx.db.patch(caseId, { status: "CLOSED_UNRESOLVED" });
    });

    await expectConvexError(
      t
        .withIdentity({ email: "usera@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(api.privateCoaching.sendUserMessage, {
            caseId,
            content: "Should fail",
          }),
        ),
      "CONFLICT",
    );
  });

  it("throws CONFLICT when case status is CLOSED_ABANDONED", async () => {
    const { t, caseId } = await seedTwoPartyEnv();
    await t.run(async (ctx) => {
      await ctx.db.patch(caseId, { status: "CLOSED_ABANDONED" });
    });

    await expectConvexError(
      t
        .withIdentity({ email: "usera@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(api.privateCoaching.sendUserMessage, {
            caseId,
            content: "Should fail",
          }),
        ),
      "CONFLICT",
    );
  });
});

// ── AC 5: markComplete + synthesis trigger ─────────────────────────────

describe("privateCoaching/markComplete — completion + synthesis", () => {
  it("sets privateCoachingCompletedAt and returns synthesisScheduled: false when only one party completes", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnv();

    const result = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );

    expect(result.synthesisScheduled).toBe(false);

    // Verify privateCoachingCompletedAt is set
    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );
    expect(psRows).toHaveLength(1);
    expect(psRows[0].privateCoachingCompletedAt).toBeGreaterThan(0);
  });

  it("returns synthesisScheduled: true when both parties have completed", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    // User A completes
    const resultA = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );
    expect(resultA.synthesisScheduled).toBe(false);

    // User B completes — now both are done
    const resultB = await t
      .withIdentity({ email: "userb@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );
    expect(resultB.synthesisScheduled).toBe(true);
  });
});

// ── AC 6: markComplete idempotency ─────────────────────────────────────

describe("privateCoaching/markComplete — idempotency", () => {
  it("calling markComplete twice does not error and returns synthesisScheduled: false on second call", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    // First call
    const first = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );
    expect(first.synthesisScheduled).toBe(false);

    // Second call — idempotent, no error
    const second = await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );
    expect(second.synthesisScheduled).toBe(false);
  });

  it("does not schedule synthesis twice when both complete and one calls again", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    // Both complete
    await t
      .withIdentity({ email: "usera@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );

    const resultB = await t
      .withIdentity({ email: "userb@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );
    expect(resultB.synthesisScheduled).toBe(true);

    // User B calls again — idempotent, no re-trigger
    const resultB2 = await t
      .withIdentity({ email: "userb@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );
    expect(resultB2.synthesisScheduled).toBe(false);
  });
});

// ── AC 7: Auth enforcement ─────────────────────────────────────────────

describe("auth enforcement", () => {
  it("myMessages throws UNAUTHENTICATED without auth", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    await expectConvexError(
      t.run(async (ctx) =>
        ctx.runQuery(api.privateCoaching.myMessages, { caseId }),
      ),
      "UNAUTHENTICATED",
    );
  });

  it("sendUserMessage throws UNAUTHENTICATED without auth", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    await expectConvexError(
      t.run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.sendUserMessage, {
          caseId,
          content: "No auth",
        }),
      ),
      "UNAUTHENTICATED",
    );
  });

  it("markComplete throws UNAUTHENTICATED without auth", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    await expectConvexError(
      t.run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      ),
      "UNAUTHENTICATED",
    );
  });

  it("sendUserMessage throws FORBIDDEN for a non-party user", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "outsider@test.com",
        displayName: "Outsider",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ email: "outsider@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(api.privateCoaching.sendUserMessage, {
            caseId,
            content: "Intruder message",
          }),
        ),
      "FORBIDDEN",
    );
  });

  it("markComplete throws FORBIDDEN for a non-party user", async () => {
    const { t, caseId } = await seedTwoPartyEnv();

    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "outsider2@test.com",
        displayName: "Outsider2",
        role: "USER",
        createdAt: Date.now(),
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ email: "outsider2@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
        ),
      "FORBIDDEN",
    );
  });

  it("myMessages returns empty array (not FORBIDDEN) for a non-party user", async () => {
    const { t, userAId, caseId } = await seedTwoPartyEnv();

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "outsider3@test.com",
        displayName: "Outsider3",
        role: "USER",
        createdAt: Date.now(),
      });
      await ctx.db.insert("privateMessages", {
        caseId,
        userId: userAId,
        role: "USER",
        content: "Existing message",
        status: "COMPLETE",
        createdAt: 1000,
      });
    });

    const result = await t
      .withIdentity({ email: "outsider3@test.com" })
      .run(async (ctx) =>
        ctx.runQuery(api.privateCoaching.myMessages, { caseId }),
      );

    expect(result).toEqual([]);
  });
});
