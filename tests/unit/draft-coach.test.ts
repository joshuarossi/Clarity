import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { anyApi } from "convex/server";
import schema from "../../convex/schema";

// All draftCoach functions are pending implementation — use anyApi for TDD red state.
const draftCoachApi = {
  session: anyApi.draftCoach.session,
  startSession: anyApi.draftCoach.startSession,
  sendMessage: anyApi.draftCoach.sendMessage,
  sendFinalDraft: anyApi.draftCoach.sendFinalDraft,
  discardSession: anyApi.draftCoach.discardSession,
};

/**
 * WOR-127: Draft coach Convex module — session queries + mutations.
 *
 * Unit tests using convex-test with the project schema.
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

  const { caseId, versionId } = await t.run(async (ctx) => {
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

    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userAId,
      role: "INITIATOR",
      mainTopic: "Topic A",
      description: "Desc A",
      desiredOutcome: "Outcome A",
      formCompletedAt: Date.now(),
      privateCoachingCompletedAt: Date.now(),
    });
    await ctx.db.insert("partyStates", {
      caseId: cId,
      userId: userBId,
      role: "INVITEE",
      mainTopic: "Topic B",
      description: "Desc B",
      desiredOutcome: "Outcome B",
      formCompletedAt: Date.now(),
      privateCoachingCompletedAt: Date.now(),
    });

    return { caseId: cId, versionId: vId };
  });

  return { t, userAId, userBId, caseId, versionId };
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

// ── AC 1: draftCoach/session query ────────────────────────────────────

describe("draftCoach/session query", () => {
  it("returns { session, messages } for the owning user with an ACTIVE session", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    // Seed an ACTIVE draftSession with messages for user A
    const sessionId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Help me draft something",
        status: "COMPLETE",
        createdAt: 1000,
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "AI",
        content: "Sure, let me help",
        status: "COMPLETE",
        createdAt: 2000,
      });
      return sId;
    });

    const result = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) => ctx.runQuery(draftCoachApi.session, { caseId }));

    expect(result).not.toBeNull();
    expect(result!.session._id).toEqual(sessionId);
    expect(result!.session.status).toBe("ACTIVE");
    expect(result!.messages).toHaveLength(2);
  });

  it("returns null when no ACTIVE session exists", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    const result = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) => ctx.runQuery(draftCoachApi.session, { caseId }));

    expect(result).toBeNull();
  });

  it("excludes SENT sessions — returns null", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    await t.run(async (ctx) => {
      await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "SENT",
        createdAt: Date.now(),
        completedAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) => ctx.runQuery(draftCoachApi.session, { caseId }));

    expect(result).toBeNull();
  });

  it("excludes DISCARDED sessions — returns null", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    await t.run(async (ctx) => {
      await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "DISCARDED",
        createdAt: Date.now(),
        completedAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) => ctx.runQuery(draftCoachApi.session, { caseId }));

    expect(result).toBeNull();
  });
});

// ── AC 2: draftCoach/startSession mutation ────────────────────────────

describe("draftCoach/startSession mutation", () => {
  it("creates a draftSessions row with status=ACTIVE and schedules generateResponse", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    const sessionId = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) =>
        ctx.runMutation(draftCoachApi.startSession, { caseId }),
      );

    expect(sessionId).toBeDefined();

    // Verify the inserted session via typed table query
    const sessions = await t.run(async (ctx) =>
      ctx.db
        .query("draftSessions")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    expect(session.caseId).toEqual(caseId);
    expect(session.userId).toEqual(userAId);
    expect(session.status).toBe("ACTIVE");
    expect(session.createdAt).toBeGreaterThan(0);

    // Verify generateResponse was scheduled
    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("draftCoach") &&
        job.name.includes("generateResponse"),
    );
    expect(
      generateResponseJob,
      "Expected draftCoach.generateResponse to be scheduled after startSession",
    ).toBeDefined();
  });

  it("throws CONFLICT when an ACTIVE session already exists for the user+case", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    // Pre-seed an ACTIVE session
    await t.run(async (ctx) => {
      await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
    });

    await expectConvexError(
      t
        .withIdentity({ subject: userAId })
        .run(async (ctx) =>
          ctx.runMutation(draftCoachApi.startSession, { caseId }),
        ),
      "CONFLICT",
    );
  });
});

// ── AC 3: draftCoach/sendMessage mutation ─────────────────────────────

describe("draftCoach/sendMessage mutation", () => {
  it("inserts a draftMessages row with role=USER and schedules generateResponse", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    // Create an ACTIVE session
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    const messageId = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) =>
        ctx.runMutation(draftCoachApi.sendMessage, {
          sessionId,
          content: "I want to say something about the schedule",
        }),
      );

    expect(messageId).toBeDefined();

    // Verify the inserted message via typed table query
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("draftMessages")
        .withIndex("by_draft_session", (q) => q.eq("draftSessionId", sessionId))
        .collect(),
    );
    expect(messages).toHaveLength(1);
    const msg = messages[0];
    expect(msg.draftSessionId).toEqual(sessionId);
    expect(msg.role).toBe("USER");
    expect(msg.content).toBe("I want to say something about the schedule");
    expect(msg.status).toBe("COMPLETE");
    expect(msg.createdAt).toBeGreaterThan(0);

    // Verify generateResponse was scheduled
    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const generateResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("draftCoach") &&
        job.name.includes("generateResponse"),
    );
    expect(
      generateResponseJob,
      "Expected draftCoach.generateResponse to be scheduled after sendMessage",
    ).toBeDefined();
  });

  it("throws CONFLICT when session is not ACTIVE", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    // Create a SENT session
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "SENT",
        createdAt: Date.now(),
        completedAt: Date.now(),
      }),
    );

    await expectConvexError(
      t.withIdentity({ subject: userAId }).run(async (ctx) =>
        ctx.runMutation(draftCoachApi.sendMessage, {
          sessionId,
          content: "Should fail",
        }),
      ),
      "CONFLICT",
    );
  });
});

// ── AC 4: draftCoach/sendFinalDraft — happy path ─────────────────────

describe("draftCoach/sendFinalDraft mutation — happy path", () => {
  it("posts finalDraft to joint chat, marks session SENT, and schedules generateCoachResponse", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    // Create ACTIVE session with finalDraft populated
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
        finalDraft: "I think we should discuss the timeline more carefully.",
      }),
    );

    const jointMessageId = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) =>
        ctx.runMutation(draftCoachApi.sendFinalDraft, { sessionId }),
      );

    expect(jointMessageId).toBeDefined();

    // Verify session is now SENT with completedAt via typed table query
    const sessions = await t.run(async (ctx) =>
      ctx.db
        .query("draftSessions")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("SENT");
    expect(sessions[0].completedAt).toBeGreaterThan(0);

    // Verify jointMessages row was created with draft content
    const jointMessages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    expect(jointMessages).toHaveLength(1);
    const jointMsg = jointMessages[0];
    expect(jointMsg.caseId).toEqual(caseId);
    expect(jointMsg.authorType).toBe("USER");
    expect(jointMsg.authorUserId).toEqual(userAId);
    expect(jointMsg.content).toBe(
      "I think we should discuss the timeline more carefully.",
    );
    expect(jointMsg.status).toBe("COMPLETE");

    // Verify generateCoachResponse was scheduled
    const scheduledFns = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const coachResponseJob = scheduledFns.find(
      (job) =>
        typeof job.name === "string" &&
        job.name.includes("jointChat") &&
        job.name.includes("generateCoachResponse"),
    );
    expect(
      coachResponseJob,
      "Expected jointChat.generateCoachResponse to be scheduled after sendFinalDraft",
    ).toBeDefined();
  });
});

// ── AC 5: draftCoach/sendFinalDraft — conflict ───────────────────────

describe("draftCoach/sendFinalDraft mutation — conflict", () => {
  it("throws CONFLICT when finalDraft is undefined", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    // Create ACTIVE session without finalDraft
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ subject: userAId })
        .run(async (ctx) =>
          ctx.runMutation(draftCoachApi.sendFinalDraft, { sessionId }),
        ),
      "CONFLICT",
    );
  });

  it("throws CONFLICT when session is not ACTIVE", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    // Create DISCARDED session with finalDraft
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "DISCARDED",
        createdAt: Date.now(),
        completedAt: Date.now(),
        finalDraft: "Some draft",
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ subject: userAId })
        .run(async (ctx) =>
          ctx.runMutation(draftCoachApi.sendFinalDraft, { sessionId }),
        ),
      "CONFLICT",
    );
  });
});

// ── AC 6: draftCoach/discardSession ───────────────────────────────────

describe("draftCoach/discardSession mutation", () => {
  it("marks session DISCARDED with completedAt, no joint message created", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    // Create ACTIVE session
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) =>
        ctx.runMutation(draftCoachApi.discardSession, { sessionId }),
      );

    // Verify session status
    const session = await t.run(async (ctx) => ctx.db.get(sessionId));
    expect(session!.status).toBe("DISCARDED");
    expect(session!.completedAt).toBeGreaterThan(0);

    // Verify no jointMessages were created
    const jointMessages = await t.run(async (ctx) =>
      ctx.db
        .query("jointMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    expect(jointMessages).toHaveLength(0);
  });

  it("throws CONFLICT when session is not ACTIVE", async () => {
    const { t, userAId, caseId } = await seedJointActiveEnv();

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "SENT",
        createdAt: Date.now(),
        completedAt: Date.now(),
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ subject: userAId })
        .run(async (ctx) =>
          ctx.runMutation(draftCoachApi.discardSession, { sessionId }),
        ),
      "CONFLICT",
    );
  });
});

// ── AC 7: Privacy — session query enforces userId match ───────────────

describe("draftCoach privacy — session query enforces userId match", () => {
  it("returns null when User B queries User A's active draft session", async () => {
    const { t, userAId, userBId, caseId } = await seedJointActiveEnv();

    // Create ACTIVE session for User A
    await t.run(async (ctx) => {
      const sId = await ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      await ctx.db.insert("draftMessages", {
        draftSessionId: sId,
        role: "USER",
        content: "Private draft content",
        status: "COMPLETE",
        createdAt: Date.now(),
      });
    });

    // User B (also a party on the case) queries — should get null
    const result = await t
      .withIdentity({ subject: userBId })
      .run(async (ctx) => ctx.runQuery(draftCoachApi.session, { caseId }));

    expect(result).toBeNull();
  });

  it("sendMessage throws FORBIDDEN when called by a different party on a session they don't own", async () => {
    const { t, userAId, userBId, caseId } = await seedJointActiveEnv();

    // Create ACTIVE session for User A
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    // User B tries to send a message on User A's session
    await expectConvexError(
      t.withIdentity({ subject: userBId }).run(async (ctx) =>
        ctx.runMutation(draftCoachApi.sendMessage, {
          sessionId,
          content: "Trying to hijack",
        }),
      ),
      "FORBIDDEN",
    );
  });

  it("sendFinalDraft throws FORBIDDEN when called by a different party", async () => {
    const { t, userAId, userBId, caseId } = await seedJointActiveEnv();

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
        finalDraft: "A's draft",
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ subject: userBId })
        .run(async (ctx) =>
          ctx.runMutation(draftCoachApi.sendFinalDraft, { sessionId }),
        ),
      "FORBIDDEN",
    );
  });

  it("discardSession throws FORBIDDEN when called by a different party", async () => {
    const { t, userAId, userBId, caseId } = await seedJointActiveEnv();

    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        caseId,
        userId: userAId,
        status: "ACTIVE",
        createdAt: Date.now(),
      }),
    );

    await expectConvexError(
      t
        .withIdentity({ subject: userBId })
        .run(async (ctx) =>
          ctx.runMutation(draftCoachApi.discardSession, { sessionId }),
        ),
      "FORBIDDEN",
    );
  });
});

// ── AC 8: Auth enforcement ────────────────────────────────────────────

describe("all draftCoach functions enforce auth + party-to-case check", () => {
  // ── UNAUTHENTICATED ───────────────────────────────────────────────────

  describe("unauthenticated calls throw UNAUTHENTICATED", () => {
    it("session — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) => ctx.runQuery(draftCoachApi.session, { caseId })),
        "UNAUTHENTICATED",
      );
    });

    it("startSession — unauthenticated", async () => {
      const { t, caseId } = await seedJointActiveEnv();

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(draftCoachApi.startSession, { caseId }),
        ),
        "UNAUTHENTICATED",
      );
    });

    it("sendMessage — unauthenticated", async () => {
      const { t, userAId, caseId } = await seedJointActiveEnv();

      const sessionId = await t.run(async (ctx) =>
        ctx.db.insert("draftSessions", {
          caseId,
          userId: userAId,
          status: "ACTIVE",
          createdAt: Date.now(),
        }),
      );

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(draftCoachApi.sendMessage, {
            sessionId,
            content: "Test",
          }),
        ),
        "UNAUTHENTICATED",
      );
    });

    it("sendFinalDraft — unauthenticated", async () => {
      const { t, userAId, caseId } = await seedJointActiveEnv();

      const sessionId = await t.run(async (ctx) =>
        ctx.db.insert("draftSessions", {
          caseId,
          userId: userAId,
          status: "ACTIVE",
          createdAt: Date.now(),
          finalDraft: "Draft",
        }),
      );

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(draftCoachApi.sendFinalDraft, { sessionId }),
        ),
        "UNAUTHENTICATED",
      );
    });

    it("discardSession — unauthenticated", async () => {
      const { t, userAId, caseId } = await seedJointActiveEnv();

      const sessionId = await t.run(async (ctx) =>
        ctx.db.insert("draftSessions", {
          caseId,
          userId: userAId,
          status: "ACTIVE",
          createdAt: Date.now(),
        }),
      );

      await expectConvexError(
        t.run(async (ctx) =>
          ctx.runMutation(draftCoachApi.discardSession, { sessionId }),
        ),
        "UNAUTHENTICATED",
      );
    });
  });

  // ── FORBIDDEN (non-party) ─────────────────────────────────────────────

  describe("non-party calls throw FORBIDDEN", () => {
    it("session — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      const strangerId = await seedStranger(t);

      await expectConvexError(
        t
          .withIdentity({ subject: strangerId })
          .run(async (ctx) => ctx.runQuery(draftCoachApi.session, { caseId })),
        "FORBIDDEN",
      );
    });

    it("startSession — non-party", async () => {
      const { t, caseId } = await seedJointActiveEnv();
      const strangerId = await seedStranger(t);

      await expectConvexError(
        t
          .withIdentity({ subject: strangerId })
          .run(async (ctx) =>
            ctx.runMutation(draftCoachApi.startSession, { caseId }),
          ),
        "FORBIDDEN",
      );
    });

    it("sendMessage — non-party", async () => {
      const { t, userAId, caseId } = await seedJointActiveEnv();
      const strangerId = await seedStranger(t);

      const sessionId = await t.run(async (ctx) =>
        ctx.db.insert("draftSessions", {
          caseId,
          userId: userAId,
          status: "ACTIVE",
          createdAt: Date.now(),
        }),
      );

      await expectConvexError(
        t.withIdentity({ subject: strangerId }).run(async (ctx) =>
          ctx.runMutation(draftCoachApi.sendMessage, {
            sessionId,
            content: "Test",
          }),
        ),
        "FORBIDDEN",
      );
    });

    it("sendFinalDraft — non-party", async () => {
      const { t, userAId, caseId } = await seedJointActiveEnv();
      const strangerId = await seedStranger(t);

      const sessionId = await t.run(async (ctx) =>
        ctx.db.insert("draftSessions", {
          caseId,
          userId: userAId,
          status: "ACTIVE",
          createdAt: Date.now(),
          finalDraft: "Draft",
        }),
      );

      await expectConvexError(
        t
          .withIdentity({ subject: strangerId })
          .run(async (ctx) =>
            ctx.runMutation(draftCoachApi.sendFinalDraft, { sessionId }),
          ),
        "FORBIDDEN",
      );
    });

    it("discardSession — non-party", async () => {
      const { t, userAId, caseId } = await seedJointActiveEnv();
      const strangerId = await seedStranger(t);

      const sessionId = await t.run(async (ctx) =>
        ctx.db.insert("draftSessions", {
          caseId,
          userId: userAId,
          status: "ACTIVE",
          createdAt: Date.now(),
        }),
      );

      await expectConvexError(
        t
          .withIdentity({ subject: strangerId })
          .run(async (ctx) =>
            ctx.runMutation(draftCoachApi.discardSession, { sessionId }),
          ),
        "FORBIDDEN",
      );
    });
  });
});
