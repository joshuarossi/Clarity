import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

// References for functions that will be added by the implementation agent.
// These don't exist yet on the generated `api` type, so we use Convex's
// anyApi to reference them at TDD red state without type errors.
const pendingJointChat = anyApi.jointChat;
const jointChatApi = {
  mySynthesis: api.jointChat.mySynthesis,
  enterSession: api.jointChat.enterSession,
  messages: pendingJointChat.messages,
  sendUserMessage: pendingJointChat.sendUserMessage,
  proposeClosure: pendingJointChat.proposeClosure,
  confirmClosure: pendingJointChat.confirmClosure,
  unilateralClose: pendingJointChat.unilateralClose,
  rejectClosure: pendingJointChat.rejectClosure,
  generateCoachOpeningMessage: pendingJointChat.generateCoachOpeningMessage,
};

/**
 * WOR-124: Joint chat Convex module — queries + mutations including closure.
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
 * Seeds a two-party environment with a JOINT_ACTIVE case and both partyStates.
 * Returns the convex-test client and all created IDs.
 */
async function seedJointActiveEnv() {
  const t = convexTest(schema);

  const userAId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "partyA@test.com",
      displayName: "Party A",
      role: "USER",
      createdAt: Date.now(),
    }),
  );
  const userBId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "partyB@test.com",
      displayName: "Party B",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const { caseId, versionId, partyStateAId, partyStateBId } = await t.run(
    async (ctx) => {
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
        status: "JOINT_ACTIVE",
        isSolo: false,
        category: "workplace",
        templateVersionId: vId,
        initiatorUserId: userAId,
        inviteeUserId: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const psAId = await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
        mainTopic: "Topic A",
        description: "Desc A",
        desiredOutcome: "Outcome A",
        formCompletedAt: Date.now(),
        privateCoachingCompletedAt: Date.now(),
      });
      const psBId = await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userBId,
        role: "INVITEE",
        mainTopic: "Topic B",
        description: "Desc B",
        desiredOutcome: "Outcome B",
        formCompletedAt: Date.now(),
        privateCoachingCompletedAt: Date.now(),
      });

      return {
        caseId: cId,
        versionId: vId,
        partyStateAId: psAId,
        partyStateBId: psBId,
      };
    },
  );

  return {
    t,
    userAId,
    userBId,
    caseId,
    versionId,
    partyStateAId,
    partyStateBId,
  };
}

/**
 * Seeds a non-party user (stranger) in the given test environment.
 */
async function seedStranger(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "stranger@test.com",
      displayName: "Stranger",
      role: "USER",
      createdAt: Date.now(),
    }),
  );
}

// ── AC 1: jointChat/messages query ──────────────────────────────────────

describe("jointChat/messages query", () => {
  it("returns all jointMessages for the case sorted by createdAt ascending", async () => {
    const { t, userAId, userBId, caseId } = await seedJointActiveEnv();

    // Seed 3 messages with different createdAt values (out of order insertion)
    await t.run(async (ctx) => {
      await ctx.db.insert("jointMessages", {
        caseId,
        authorType: "USER",
        authorUserId: userAId,
        content: "Second message",
        status: "COMPLETE",
        createdAt: 2000,
      });
      await ctx.db.insert("jointMessages", {
        caseId,
        authorType: "COACH",
        content: "Third message (coach)",
        status: "COMPLETE",
        createdAt: 3000,
      });
      await ctx.db.insert("jointMessages", {
        caseId,
        authorType: "USER",
        authorUserId: userBId,
        content: "First message",
        status: "COMPLETE",
        createdAt: 1000,
      });
    });

    const result = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) => ctx.runQuery(jointChatApi.messages, { caseId }));

    expect(result).toHaveLength(3);
    expect(result[0].content).toBe("First message");
    expect(result[0].createdAt).toBe(1000);
    expect(result[1].content).toBe("Second message");
    expect(result[1].createdAt).toBe(2000);
    expect(result[2].content).toBe("Third message (coach)");
    expect(result[2].createdAt).toBe(3000);
  });

  it("returns empty array when no messages exist for the case", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    const result = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) => ctx.runQuery(jointChatApi.messages, { caseId }));

    expect(result).toEqual([]);
  });

  it("never returns messages from other cases", async () => {
    const { t, userAId, caseId, versionId } = await seedJointActiveEnv();

    // Create a second case with a message
    await t.run(async (ctx) => {
      const otherCaseId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "JOINT_ACTIVE",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("jointMessages", {
        caseId: otherCaseId,
        authorType: "USER",
        authorUserId: userAId,
        content: "Message in other case",
        status: "COMPLETE",
        createdAt: 1000,
      });
    });

    // Seed a message in the original case
    await t.run(async (ctx) => {
      await ctx.db.insert("jointMessages", {
        caseId,
        authorType: "USER",
        authorUserId: userAId,
        content: "Message in original case",
        status: "COMPLETE",
        createdAt: 1000,
      });
    });

    const result = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) => ctx.runQuery(jointChatApi.messages, { caseId }));

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Message in original case");
  });

  it("throws FORBIDDEN when caller is not a party to the case", async () => {
    const { t, caseId } = await seedJointActiveEnv();
    await seedStranger(t);

    await expectConvexError(
      t
        .withIdentity({ email: "stranger@test.com" })
        .run(async (ctx) => ctx.runQuery(jointChatApi.messages, { caseId })),
      "FORBIDDEN",
    );
  });
});

// ── AC 2: jointChat/mySynthesis query ───────────────────────────────────

describe("jointChat/mySynthesis query", () => {
  it("returns the caller's own synthesisText", async () => {
    const { t, caseId, partyStateAId } = await seedJointActiveEnv();

    // Set synthesis text on party A
    await t.run(async (ctx) => {
      await ctx.db.patch(partyStateAId, {
        synthesisText: "Synthesis for party A",
        synthesisGeneratedAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) => ctx.runQuery(jointChatApi.mySynthesis, { caseId }));

    expect(result).not.toBeNull();
    expect(result!.text).toBe("Synthesis for party A");
  });

  it("each party sees only their own synthesis, not the other party's", async () => {
    const { t, caseId, partyStateAId, partyStateBId } =
      await seedJointActiveEnv();

    await t.run(async (ctx) => {
      await ctx.db.patch(partyStateAId, {
        synthesisText: "A's synthesis",
        synthesisGeneratedAt: Date.now(),
      });
      await ctx.db.patch(partyStateBId, {
        synthesisText: "B's synthesis",
        synthesisGeneratedAt: Date.now(),
      });
    });

    const resultA = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) => ctx.runQuery(jointChatApi.mySynthesis, { caseId }));

    const resultB = await t
      .withIdentity({ email: "partyB@test.com" })
      .run(async (ctx) => ctx.runQuery(jointChatApi.mySynthesis, { caseId }));

    expect(resultA!.text).toBe("A's synthesis");
    expect(resultB!.text).toBe("B's synthesis");
  });

  it("returns null when synthesis has not been generated", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    const result = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) => ctx.runQuery(jointChatApi.mySynthesis, { caseId }));

    expect(result).toBeNull();
  });

  it("throws FORBIDDEN when caller is not a party", async () => {
    const { t, caseId } = await seedJointActiveEnv();
    await seedStranger(t);

    await expectConvexError(
      t
        .withIdentity({ email: "stranger@test.com" })
        .run(async (ctx) => ctx.runQuery(jointChatApi.mySynthesis, { caseId })),
      "FORBIDDEN",
    );
  });
});

// ── AC 3: jointChat/sendUserMessage happy path ──────────────────────────

describe("jointChat/sendUserMessage mutation — happy path", () => {
  it("inserts a jointMessages row with correct fields and schedules generateCoachResponse", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    const messageId = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId,
          content: "Hello from party A",
        }),
      );

    expect(messageId).toBeDefined();

    // Verify the inserted message
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    expect(messages).toHaveLength(1);
    const msg = messages[0];
    expect(msg._id).toEqual(messageId);
    expect(msg.caseId).toEqual(caseId);
    expect(msg.authorType).toBe("USER");
    expect(msg.authorUserId).toEqual(userAId);
    expect(msg.content).toBe("Hello from party A");
    expect(msg.status).toBe("COMPLETE");
    expect(msg.createdAt).toBeGreaterThan(0);

    // Verify generateCoachResponse was scheduled via ctx.scheduler.runAfter
    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateCoachResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("jointChat") &&
        job.name.includes("generateCoachResponse"),
    );
    expect(
      generateCoachResponseJob,
      "Expected generateCoachResponse to be scheduled after sendUserMessage",
    ).toBeDefined();
    expect(generateCoachResponseJob!.args).toEqual([{ caseId, messageId }]);
  });
});

// ── WOR-145: @Coach mention detection in sendUserMessage ──────────────

describe("jointChat/sendUserMessage — @Coach mention detection (WOR-145)", () => {
  let savedClaudeMock: string | undefined;
  let savedClaudeMockDelay: string | undefined;

  beforeAll(() => {
    savedClaudeMock = process.env.CLAUDE_MOCK;
    savedClaudeMockDelay = process.env.CLAUDE_MOCK_DELAY_MS;
    process.env.CLAUDE_MOCK = "true";
    process.env.CLAUDE_MOCK_DELAY_MS = "10";
  });

  afterAll(() => {
    if (savedClaudeMock === undefined) {
      delete process.env.CLAUDE_MOCK;
    } else {
      process.env.CLAUDE_MOCK = savedClaudeMock;
    }
    if (savedClaudeMockDelay === undefined) {
      delete process.env.CLAUDE_MOCK_DELAY_MS;
    } else {
      process.env.CLAUDE_MOCK_DELAY_MS = savedClaudeMockDelay;
    }
  });

  it("AC1: schedules generateCoachResponse with triggerType 'mention' when content contains @Coach", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    const messageId = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId,
          content: "@Coach can you summarize where we are?",
        }),
      );

    expect(messageId).toBeDefined();

    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateCoachResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("jointChat") &&
        job.name.includes("generateCoachResponse"),
    );
    expect(
      generateCoachResponseJob,
      "Expected generateCoachResponse to be scheduled with triggerType: 'mention'",
    ).toBeDefined();
    expect(generateCoachResponseJob!.args).toEqual([
      { caseId, messageId, triggerType: "mention" },
    ]);
  });

  it("AC1: case-insensitive — schedules with triggerType 'mention' for @coach lowercase", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    const messageId = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId,
          content: "hey @coach what do you think",
        }),
      );

    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateCoachResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("jointChat") &&
        job.name.includes("generateCoachResponse"),
    );
    expect(generateCoachResponseJob).toBeDefined();
    expect(generateCoachResponseJob!.args).toEqual([
      { caseId, messageId, triggerType: "mention" },
    ]);
  });

  it("AC2: does NOT pass triggerType when content has no @Coach mention", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    const messageId = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId,
          content: "Hello from party A",
        }),
      );

    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateCoachResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("jointChat") &&
        job.name.includes("generateCoachResponse"),
    );
    expect(generateCoachResponseJob).toBeDefined();
    // Non-mention messages should NOT have triggerType in args
    expect(generateCoachResponseJob!.args).toEqual([{ caseId, messageId }]);
    expect(generateCoachResponseJob!.args[0]).not.toHaveProperty("triggerType");
  });

  it("AC2: near-miss — 'the coach said hello' does not trigger mention", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    const messageId = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId,
          content: "the coach said hello",
        }),
      );

    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateCoachResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("jointChat") &&
        job.name.includes("generateCoachResponse"),
    );
    expect(generateCoachResponseJob).toBeDefined();
    expect(generateCoachResponseJob!.args).toEqual([{ caseId, messageId }]);
  });

  it("AC4: mention path reaches generateCoachResponse — triggerType 'mention' bypasses suppression", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    const messageId = await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId,
          content: "@Coach please summarize our discussion",
        }),
      );

    // Verify the scheduled args include triggerType: 'mention'
    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateCoachResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("jointChat") &&
        job.name.includes("generateCoachResponse"),
    );
    expect(generateCoachResponseJob).toBeDefined();
    expect(generateCoachResponseJob!.args[0].triggerType).toBe("mention");

    // Run the action to verify the mention path produces a Coach response
    await t.action(internal.jointChat.generateCoachResponse, {
      caseId,
      messageId,
      triggerType: "mention",
    });

    // Verify a Coach message was produced
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );

    const coachMessages = messages.filter((m) => m.authorType === "COACH");
    expect(coachMessages.length).toBeGreaterThanOrEqual(1);
    expect(coachMessages[0].status).toBe("COMPLETE");
  });
});

// ── AC 4: sendUserMessage state validation ──────────────────────────────

describe("jointChat/sendUserMessage mutation — state validation", () => {
  it("throws CONFLICT when case is in PRIVATE_COACHING status", async () => {
    const { t, userAId, userBId, versionId } = await seedJointActiveEnv();

    // Create a case in BOTH_PRIVATE_COACHING (not JOINT_ACTIVE)
    const nonJointCaseId = await t.run(async (ctx) => {
      const cId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "BOTH_PRIVATE_COACHING",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        inviteeUserId: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userBId,
        role: "INVITEE",
      });
      return cId;
    });

    await expectConvexError(
      t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId: nonJointCaseId,
          content: "Should fail",
        }),
      ),
      "CONFLICT",
    );
  });

  it("throws CONFLICT when case is CLOSED_RESOLVED", async () => {
    const { t, userAId, userBId, versionId } = await seedJointActiveEnv();

    const closedCaseId = await t.run(async (ctx) => {
      const cId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "CLOSED_RESOLVED",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        inviteeUserId: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userBId,
        role: "INVITEE",
      });
      return cId;
    });

    await expectConvexError(
      t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId: closedCaseId,
          content: "Should fail",
        }),
      ),
      "CONFLICT",
    );
  });

  it("throws CONFLICT when case is CLOSED_UNRESOLVED", async () => {
    const { t, userAId, userBId, versionId } = await seedJointActiveEnv();

    const closedCaseId = await t.run(async (ctx) => {
      const cId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "CLOSED_UNRESOLVED",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        inviteeUserId: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userBId,
        role: "INVITEE",
      });
      return cId;
    });

    await expectConvexError(
      t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId: closedCaseId,
          content: "Should fail",
        }),
      ),
      "CONFLICT",
    );
  });
});

// ── AC 5: jointChat/proposeClosure ──────────────────────────────────────

describe("jointChat/proposeClosure mutation", () => {
  it("sets caller's closureProposed=true and stores closureSummary on the case", async () => {
    const { t, caseId, partyStateAId } = await seedJointActiveEnv();

    await t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
      ctx.runMutation(jointChatApi.proposeClosure, {
        caseId,
        summary: "We agreed to meet weekly.",
      }),
    );

    // Verify partyState closureProposed
    const partyStateA = await t.run(async (ctx) => ctx.db.get(partyStateAId));
    expect(partyStateA!.closureProposed).toBe(true);

    // Verify case closureSummary
    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc!.closureSummary).toBe("We agreed to meet weekly.");
  });

  it("is idempotent — calling twice updates closureSummary without error", async () => {
    const { t, caseId, partyStateAId } = await seedJointActiveEnv();

    await t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
      ctx.runMutation(jointChatApi.proposeClosure, {
        caseId,
        summary: "First summary",
      }),
    );

    await t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
      ctx.runMutation(jointChatApi.proposeClosure, {
        caseId,
        summary: "Updated summary",
      }),
    );

    const partyStateA = await t.run(async (ctx) => ctx.db.get(partyStateAId));
    expect(partyStateA!.closureProposed).toBe(true);

    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc!.closureSummary).toBe("Updated summary");
  });

  it("throws CONFLICT when case is not JOINT_ACTIVE", async () => {
    const { t, userAId, userBId, versionId } = await seedJointActiveEnv();

    const closedCaseId = await t.run(async (ctx) => {
      const cId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "CLOSED_RESOLVED",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        inviteeUserId: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userBId,
        role: "INVITEE",
      });
      return cId;
    });

    await expectConvexError(
      t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
        ctx.runMutation(jointChatApi.proposeClosure, {
          caseId: closedCaseId,
          summary: "Should fail",
        }),
      ),
      "CONFLICT",
    );
  });
});

// ── AC 6: jointChat/confirmClosure ──────────────────────────────────────

describe("jointChat/confirmClosure mutation", () => {
  it("transitions case to CLOSED_RESOLVED when other party has proposed", async () => {
    const { t, caseId, partyStateAId } = await seedJointActiveEnv();

    // Party A proposes closure
    await t.run(async (ctx) => {
      await ctx.db.patch(partyStateAId, { closureProposed: true });
    });

    // Party B confirms
    await t
      .withIdentity({ email: "partyB@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.confirmClosure, { caseId }),
      );

    // Verify case status and closedAt
    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc!.status).toBe("CLOSED_RESOLVED");
    expect(caseDoc!.closedAt).toBeGreaterThan(0);
  });

  it("sets both parties' closureProposed and closureConfirmed to true", async () => {
    const { t, caseId, partyStateAId, partyStateBId } =
      await seedJointActiveEnv();

    // Party A proposes
    await t.run(async (ctx) => {
      await ctx.db.patch(partyStateAId, { closureProposed: true });
    });

    // Party B confirms
    await t
      .withIdentity({ email: "partyB@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.confirmClosure, { caseId }),
      );

    const partyStateA = await t.run(async (ctx) => ctx.db.get(partyStateAId));
    const partyStateB = await t.run(async (ctx) => ctx.db.get(partyStateBId));
    expect(partyStateA!.closureProposed).toBe(true);
    expect(partyStateA!.closureConfirmed).toBe(true);
    expect(partyStateB!.closureProposed).toBe(true);
    expect(partyStateB!.closureConfirmed).toBe(true);
  });

  it("throws CONFLICT when no one has proposed closure", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    await expectConvexError(
      t
        .withIdentity({ email: "partyB@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(jointChatApi.confirmClosure, { caseId }),
        ),
      "CONFLICT",
    );
  });
});

// ── AC 7: jointChat/unilateralClose ─────────────────────────────────────

describe("jointChat/unilateralClose mutation", () => {
  it("transitions case to CLOSED_UNRESOLVED immediately", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.unilateralClose, { caseId }),
      );

    const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
    expect(caseDoc!.status).toBe("CLOSED_UNRESOLVED");
    expect(caseDoc!.closedAt).toBeGreaterThan(0);
  });

  it("throws CONFLICT when case is not JOINT_ACTIVE", async () => {
    const { t, userAId, userBId, versionId } = await seedJointActiveEnv();

    const closedCaseId = await t.run(async (ctx) => {
      const cId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "CLOSED_RESOLVED",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        inviteeUserId: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userBId,
        role: "INVITEE",
      });
      return cId;
    });

    await expectConvexError(
      t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
        ctx.runMutation(jointChatApi.unilateralClose, {
          caseId: closedCaseId,
        }),
      ),
      "CONFLICT",
    );
  });

  // ── WOR-148: Notification on unilateral close ───────────────────────────

  it("AC1: inserts a notification record addressed to the other party on unilateral close", async () => {
    const { t, userBId, caseId } = await seedJointActiveEnv();

    // Party A closes unilaterally — Party B should be notified
    await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.unilateralClose, { caseId }),
      );

    const notifications = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .filter((q) => q.eq(q.field("caseId"), caseId))
        .collect(),
    );

    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId).toEqual(userBId);
    expect(notifications[0].caseId).toEqual(caseId);
    expect(notifications[0].type).toBe("CASE_CLOSED_UNRESOLVED");
    expect(notifications[0].read).toBe(false);
  });

  it("AC2: notification record shape matches abandonedCases pattern (userId, caseId, type, read, createdAt)", async () => {
    const { t, caseId } = await seedJointActiveEnv();

    await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.unilateralClose, { caseId }),
      );

    const notifications = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .filter((q) => q.eq(q.field("caseId"), caseId))
        .collect(),
    );

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toHaveProperty("userId");
    expect(notifications[0]).toHaveProperty("caseId");
    expect(notifications[0]).toHaveProperty("type", "CASE_CLOSED_UNRESOLVED");
    expect(notifications[0]).toHaveProperty("read", false);
    expect(notifications[0].createdAt).toBeGreaterThan(0);
  });

  it("AC3: no notification inserted when inviteeUserId is null (invitee never joined)", async () => {
    const { t, userAId, versionId } = await seedJointActiveEnv();

    // Create a case where invitee never joined (no inviteeUserId)
    const soloStartCaseId = await t.run(async (ctx) => {
      const cId = await ctx.db.insert("cases", {
        schemaVersion: 1,
        status: "JOINT_ACTIVE",
        isSolo: false,
        category: "workplace",
        templateVersionId: versionId,
        initiatorUserId: userAId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
        mainTopic: "Topic",
        description: "Desc",
        desiredOutcome: "Outcome",
        formCompletedAt: Date.now(),
        privateCoachingCompletedAt: Date.now(),
      });
      return cId;
    });

    await t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
      ctx.runMutation(jointChatApi.unilateralClose, {
        caseId: soloStartCaseId,
      }),
    );

    // Verify case closed successfully
    const caseDoc = await t.run(async (ctx) => ctx.db.get(soloStartCaseId));
    expect(caseDoc!.status).toBe("CLOSED_UNRESOLVED");

    // Verify no notification was inserted
    const notifications = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .filter((q) => q.eq(q.field("caseId"), soloStartCaseId))
        .collect(),
    );

    expect(notifications).toHaveLength(0);
  });

  it("AC4: notification is addressed to the other party (not the caller) — fulfills UI promise", async () => {
    const { t, userAId, userBId, caseId } = await seedJointActiveEnv();

    // Party A closes — notification should go to B, not A
    await t
      .withIdentity({ email: "partyA@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.unilateralClose, { caseId }),
      );

    const notifications = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .filter((q) => q.eq(q.field("caseId"), caseId))
        .collect(),
    );

    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId).toEqual(userBId);
    expect(notifications[0].userId).not.toEqual(userAId);
  });
});

// ── AC 8: Rejecting a closure proposal ──────────────────────────────────

describe("jointChat/rejectClosure mutation", () => {
  it("clears the proposer's closureProposed flag", async () => {
    const { t, caseId, partyStateAId } = await seedJointActiveEnv();

    // Party A proposes
    await t.run(async (ctx) => {
      await ctx.db.patch(partyStateAId, { closureProposed: true });
    });

    // Party B rejects
    await t
      .withIdentity({ email: "partyB@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.rejectClosure, { caseId }),
      );

    const partyStateA = await t.run(async (ctx) => ctx.db.get(partyStateAId));
    expect(partyStateA!.closureProposed).toBe(false);
  });

  it("is a no-op when no proposal exists (no error thrown)", async () => {
    const { t, caseId, partyStateAId } = await seedJointActiveEnv();

    // Party B rejects even though no one proposed — should not throw
    await t
      .withIdentity({ email: "partyB@test.com" })
      .run(async (ctx) =>
        ctx.runMutation(jointChatApi.rejectClosure, { caseId }),
      );

    const partyStateA = await t.run(async (ctx) => ctx.db.get(partyStateAId));
    // closureProposed should be false (or remain falsy)
    expect(partyStateA!.closureProposed).toBeFalsy();
  });
});

// ── AC 9: Auth enforcement ──────────────────────────────────────────────

describe("all jointChat functions enforce auth + party-to-case check", () => {
  // ── UNAUTHENTICATED ───────────────────────────────────────────────────

  describe("unauthenticated calls throw UNAUTHENTICATED", () => {
    it("messages — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) => ctx.runQuery(jointChatApi.messages, { caseId })),
        "UNAUTHENTICATED",
      );
    });

    it("mySynthesis — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runQuery(jointChatApi.mySynthesis, { caseId }),
        ),
        "UNAUTHENTICATED",
      );
    });

    it("sendUserMessage — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(jointChatApi.sendUserMessage, {
            caseId,
            content: "Test",
          }),
        ),
        "UNAUTHENTICATED",
      );
    });

    it("proposeClosure — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(jointChatApi.proposeClosure, {
            caseId,
            summary: "Test",
          }),
        ),
        "UNAUTHENTICATED",
      );
    });

    it("confirmClosure — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(jointChatApi.confirmClosure, { caseId }),
        ),
        "UNAUTHENTICATED",
      );
    });

    it("unilateralClose — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(jointChatApi.unilateralClose, { caseId }),
        ),
        "UNAUTHENTICATED",
      );
    });

    it("rejectClosure — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(jointChatApi.rejectClosure, { caseId }),
        ),
        "UNAUTHENTICATED",
      );
    });
  });

  // ── FORBIDDEN (non-party) ─────────────────────────────────────────────

  describe("non-party calls throw FORBIDDEN", () => {
    it("messages — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      await seedStranger(t);

      await expectConvexError(
        t
          .withIdentity({ email: "stranger@test.com" })
          .run(async (ctx) => ctx.runQuery(jointChatApi.messages, { caseId })),
        "FORBIDDEN",
      );
    });

    it("mySynthesis — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      await seedStranger(t);

      await expectConvexError(
        t
          .withIdentity({ email: "stranger@test.com" })
          .run(async (ctx) =>
            ctx.runQuery(jointChatApi.mySynthesis, { caseId }),
          ),
        "FORBIDDEN",
      );
    });

    it("sendUserMessage — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      await seedStranger(t);

      await expectConvexError(
        t.withIdentity({ email: "stranger@test.com" }).run(async (ctx) =>
          ctx.runMutation(jointChatApi.sendUserMessage, {
            caseId,
            content: "Test",
          }),
        ),
        "FORBIDDEN",
      );
    });

    it("proposeClosure — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      await seedStranger(t);

      await expectConvexError(
        t.withIdentity({ email: "stranger@test.com" }).run(async (ctx) =>
          ctx.runMutation(jointChatApi.proposeClosure, {
            caseId,
            summary: "Test",
          }),
        ),
        "FORBIDDEN",
      );
    });

    it("confirmClosure — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      await seedStranger(t);

      await expectConvexError(
        t
          .withIdentity({ email: "stranger@test.com" })
          .run(async (ctx) =>
            ctx.runMutation(jointChatApi.confirmClosure, { caseId }),
          ),
        "FORBIDDEN",
      );
    });

    it("unilateralClose — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      await seedStranger(t);

      await expectConvexError(
        t
          .withIdentity({ email: "stranger@test.com" })
          .run(async (ctx) =>
            ctx.runMutation(jointChatApi.unilateralClose, { caseId }),
          ),
        "FORBIDDEN",
      );
    });

    it("rejectClosure — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      await seedStranger(t);

      await expectConvexError(
        t
          .withIdentity({ email: "stranger@test.com" })
          .run(async (ctx) =>
            ctx.runMutation(jointChatApi.rejectClosure, { caseId }),
          ),
        "FORBIDDEN",
      );
    });
  });
});

// ── WOR-144: Coach opening message tests ──────────────────────────────────

/**
 * Seeds a two-party environment with a READY_FOR_JOINT case (pre-transition).
 * Used for testing enterSession's scheduling behavior.
 */
async function seedReadyForJointEnv() {
  const t = convexTest(schema);

  const userAId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "partyA@test.com",
      displayName: "Party A",
      role: "USER",
      createdAt: Date.now(),
    }),
  );
  const userBId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "partyB@test.com",
      displayName: "Party B",
      role: "USER",
      createdAt: Date.now(),
    }),
  );

  const { caseId, versionId, partyStateAId, partyStateBId } = await t.run(
    async (ctx) => {
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
        status: "READY_FOR_JOINT",
        isSolo: false,
        category: "workplace",
        templateVersionId: vId,
        initiatorUserId: userAId,
        inviteeUserId: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const psAId = await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userAId,
        role: "INITIATOR",
        mainTopic: "Disagreement over project deadlines",
        description: "Desc A",
        desiredOutcome: "Outcome A",
        synthesisText: "Party A feels deadlines are unrealistic.",
        synthesisGeneratedAt: Date.now(),
        formCompletedAt: Date.now(),
        privateCoachingCompletedAt: Date.now(),
      });
      const psBId = await ctx.db.insert("partyStates", {
        caseId: cId,
        userId: userBId,
        role: "INVITEE",
        mainTopic: "Topic B",
        description: "Desc B",
        desiredOutcome: "Outcome B",
        synthesisText: "Party B feels unheard.",
        synthesisGeneratedAt: Date.now(),
        formCompletedAt: Date.now(),
        privateCoachingCompletedAt: Date.now(),
      });

      return {
        caseId: cId,
        versionId: vId,
        partyStateAId: psAId,
        partyStateBId: psBId,
      };
    },
  );

  return {
    t,
    userAId,
    userBId,
    caseId,
    versionId,
    partyStateAId,
    partyStateBId,
  };
}

describe("WOR-144: Coach opening message on joint session entry", () => {
  let savedClaudeMock: string | undefined;
  let savedClaudeMockDelay: string | undefined;

  beforeAll(() => {
    savedClaudeMock = process.env.CLAUDE_MOCK;
    savedClaudeMockDelay = process.env.CLAUDE_MOCK_DELAY_MS;
    process.env.CLAUDE_MOCK = "true";
    process.env.CLAUDE_MOCK_DELAY_MS = "10";
  });

  afterAll(() => {
    if (savedClaudeMock === undefined) {
      delete process.env.CLAUDE_MOCK;
    } else {
      process.env.CLAUDE_MOCK = savedClaudeMock;
    }
    if (savedClaudeMockDelay === undefined) {
      delete process.env.CLAUDE_MOCK_DELAY_MS;
    } else {
      process.env.CLAUDE_MOCK_DELAY_MS = savedClaudeMockDelay;
    }
  });
  // ── AC1: enterSession schedules generateCoachOpeningMessage ────────────

  describe("AC1: enterSession schedules generateCoachOpeningMessage", () => {
    it("schedules generateCoachOpeningMessage when case transitions to JOINT_ACTIVE for the first time", async () => {
      const { t, caseId } = await seedReadyForJointEnv();

      await t
        .withIdentity({ email: "partyA@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(jointChatApi.enterSession, { caseId }),
        );

      // Verify the case transitioned
      const caseDoc = await t.run(async (ctx) => ctx.db.get(caseId));
      expect(caseDoc!.status).toBe("JOINT_ACTIVE");

      // Verify generateCoachOpeningMessage was scheduled
      const scheduledFns = await t.run(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );

      const openingMessageJob = scheduledFns.find(
        (job) =>
          typeof job.name === "string" &&
          job.name.includes("generateCoachOpeningMessage"),
      );
      expect(
        openingMessageJob,
        "Expected generateCoachOpeningMessage to be scheduled after enterSession transitions to JOINT_ACTIVE",
      ).toBeDefined();
      expect(openingMessageJob!.args).toEqual([{ caseId }]);
    });
  });

  // ── AC2: Coach opening message is grounded in mainTopic ────────────────

  describe("AC2: generateCoachOpeningMessage inserts a COACH message", () => {
    it("inserts a jointMessages row with authorType COACH and status COMPLETE", async () => {
      const { t, caseId } = await seedReadyForJointEnv();

      // Transition to JOINT_ACTIVE first
      await t
        .withIdentity({ email: "partyA@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(jointChatApi.enterSession, { caseId }),
        );

      // Run the internal action directly (CLAUDE_MOCK=true in test env)
      await t.action(internal.jointChat.generateCoachOpeningMessage, {
        caseId,
      });

      // Verify a COACH message was inserted
      const messages = await t.run(async (ctx) =>
        ctx.db
          .query("jointMessages")
          .withIndex("by_case", (q) => q.eq("caseId", caseId))
          .collect(),
      );

      const coachMessage = messages.find((m) => m.authorType === "COACH");
      expect(
        coachMessage,
        "Expected a COACH message to be inserted",
      ).toBeDefined();
      expect(coachMessage!.authorType).toBe("COACH");
      expect(coachMessage!.status).toBe("COMPLETE");
      expect(coachMessage!.content.length).toBeGreaterThan(0);
    });
  });

  // ── AC3: Coach message appears before user messages ────────────────────

  describe("AC3: Coach opening message appears before user messages in transcript", () => {
    it("the COACH message has a createdAt earlier than any subsequent user message", async () => {
      const { t, caseId } = await seedReadyForJointEnv();

      // Transition to JOINT_ACTIVE
      await t
        .withIdentity({ email: "partyA@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(jointChatApi.enterSession, { caseId }),
        );

      // Generate coach opening message
      await t.action(internal.jointChat.generateCoachOpeningMessage, {
        caseId,
      });

      // Now send a user message
      await t.withIdentity({ email: "partyA@test.com" }).run(async (ctx) =>
        ctx.runMutation(jointChatApi.sendUserMessage, {
          caseId,
          content: "Hello from party A",
        }),
      );

      // Query all messages sorted by createdAt
      const allMessages = await t.run(async (ctx) =>
        ctx.db
          .query("jointMessages")
          .withIndex("by_case", (q) => q.eq("caseId", caseId))
          .collect(),
      );

      const sorted = allMessages.sort((a, b) => a.createdAt - b.createdAt);
      expect(sorted[0].authorType).toBe("COACH");

      const userMessages = sorted.filter((m) => m.authorType === "USER");
      if (userMessages.length > 0) {
        expect(sorted[0].createdAt).toBeLessThanOrEqual(
          userMessages[0].createdAt,
        );
      }
    });
  });

  // ── AC4: Re-entry guard — no duplicate Coach opening message ───────────

  describe("AC4: Re-entry guard prevents duplicate Coach opening message", () => {
    it("calling enterSession on a JOINT_ACTIVE case does not schedule a second generateCoachOpeningMessage", async () => {
      const { t, caseId } = await seedReadyForJointEnv();

      // First call — transitions to JOINT_ACTIVE
      await t
        .withIdentity({ email: "partyA@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(jointChatApi.enterSession, { caseId }),
        );

      // Second call — should throw CONFLICT (state machine prevents re-entry)
      await expectConvexError(
        t
          .withIdentity({ email: "partyB@test.com" })
          .run(async (ctx) =>
            ctx.runMutation(jointChatApi.enterSession, { caseId }),
          ),
        "CONFLICT",
      );

      // Verify only one generateCoachOpeningMessage was scheduled
      const scheduledFns = await t.run(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );

      const openingMessageJobs = scheduledFns.filter(
        (job) =>
          typeof job.name === "string" &&
          job.name.includes("generateCoachOpeningMessage"),
      );
      expect(openingMessageJobs).toHaveLength(1);
    });
  });

  // ── AC5: Uses same streaming-insert path as reactive coach responses ───

  describe("AC5: Coach opening message uses streaming-insert path with privacy filtering", () => {
    it("produces a COMPLETE message using the same mock streaming path as generateCoachResponse", async () => {
      const { t, userAId, caseId } = await seedReadyForJointEnv();

      // Transition to JOINT_ACTIVE
      await t
        .withIdentity({ email: "partyA@test.com" })
        .run(async (ctx) =>
          ctx.runMutation(jointChatApi.enterSession, { caseId }),
        );

      // Seed a private message to verify privacy filtering doesn't leak it
      await t.run(async (ctx) => {
        await ctx.db.insert("privateMessages", {
          caseId,
          userId: userAId,
          role: "USER",
          content: "My secret private thought about the conflict",
          status: "COMPLETE",
          createdAt: Date.now(),
        });
      });

      // Run the internal action
      await t.action(internal.jointChat.generateCoachOpeningMessage, {
        caseId,
      });

      // Verify the message has COMPLETE status (streaming lifecycle finished)
      const messages = await t.run(async (ctx) =>
        ctx.db
          .query("jointMessages")
          .withIndex("by_case", (q) => q.eq("caseId", caseId))
          .collect(),
      );

      const coachMessage = messages.find((m) => m.authorType === "COACH");
      expect(coachMessage, "Expected a COACH opening message").toBeDefined();
      expect(coachMessage!.status).toBe("COMPLETE");
      // The content should not contain verbatim private message content
      expect(coachMessage!.content).not.toContain(
        "My secret private thought about the conflict",
      );
    });
  });
});
