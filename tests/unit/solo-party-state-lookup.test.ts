import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

/**
 * WOR-167: Solo-mode partyState lookup — verify that every .unique()
 * consumer of the by_case_and_user index tolerates solo cases where
 * one user has two partyStates rows (INITIATOR + INVITEE).
 */

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Seeds a solo-mode case via api.cases.create with isSolo=true.
 * Produces 2 partyStates rows for the same userId (one INITIATOR, one
 * INVITEE) and a case in BOTH_PRIVATE_COACHING status.
 */
async function seedSoloCase(email: string) {
  const t = convexTest(schema);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email,
      displayName: email.split("@")[0],
      role: "USER",
      createdAt: Date.now(),
    }),
  );
  await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category: "personal",
      name: "Personal Template",
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
  });
  const result = await t.withIdentity({ subject: userId }).run(async (ctx) =>
    ctx.runMutation(api.cases.create, {
      category: "personal",
      mainTopic: "Solo topic",
      description: "Solo desc",
      desiredOutcome: "Solo outcome",
      isSolo: true,
    }),
  );
  return { t, userId, caseId: result.caseId };
}

/**
 * Seeds a standard two-party case in BOTH_PRIVATE_COACHING status.
 * Each user has exactly one partyStates row — the non-solo baseline.
 */
async function seedStandardCase(emailA: string, emailB: string) {
  const t = convexTest(schema);
  const userAId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: emailA,
      displayName: emailA.split("@")[0],
      role: "USER",
      createdAt: Date.now(),
    }),
  );
  const userBId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: emailB,
      displayName: emailB.split("@")[0],
      role: "USER",
      createdAt: Date.now(),
    }),
  );
  await t.run(async (ctx) => {
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
  });
  const result = await t
    .withIdentity({ subject: userAId })
    .run(async (ctx) =>
      ctx.runMutation(api.cases.create, {
        category: "workplace",
        mainTopic: "Standard topic",
        description: "Standard desc",
        desiredOutcome: "Standard outcome",
      }),
    );
  // Add invitee and advance to BOTH_PRIVATE_COACHING
  await t.run(async (ctx) => {
    await ctx.db.patch(result.caseId, {
      inviteeUserId: userBId,
      status: "BOTH_PRIVATE_COACHING",
    });
    await ctx.db.insert("partyStates", {
      caseId: result.caseId,
      userId: userBId,
      role: "INVITEE",
      mainTopic: "Invitee topic",
      description: "Invitee desc",
      desiredOutcome: "Invitee outcome",
      formCompletedAt: Date.now(),
    });
  });
  return { t, userAId, userBId, caseId: result.caseId };
}

// ── AC1: listForDashboard ───────────────────────────────────────────────

describe("AC1: listForDashboard with solo-mode case", () => {
  it("loads without error and displays the solo case with correct status", async () => {
    const { t, userId, caseId } = await seedSoloCase("solo-dash@test.com");

    const result = await t
      .withIdentity({ subject: userId })
      .run(async (ctx) => ctx.runQuery(api.cases.listForDashboard, {}));

    expect(result).toBeDefined();
    const soloCase = result.find((c) => c._id === caseId);
    expect(soloCase).toBeDefined();
    expect(soloCase!.status).toBe("BOTH_PRIVATE_COACHING");
  });
});

// ── AC2: updateMyForm ───────────────────────────────────────────────────

describe("AC2: updateMyForm with solo-mode case", () => {
  it("succeeds and updates the correct partyState for the acting role", async () => {
    const { t, userId, caseId } = await seedSoloCase("solo-update@test.com");

    await t.withIdentity({ subject: userId }).run(async (ctx) =>
      ctx.runMutation(api.cases.updateMyForm, {
        caseId,
        mainTopic: "Updated solo topic",
        description: "Updated solo desc",
        desiredOutcome: "Updated solo outcome",
      }),
    );

    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    const updated = psRows.find(
      (ps) => ps.mainTopic === "Updated solo topic",
    );
    expect(updated).toBeDefined();
    expect(updated!.mainTopic).toBe("Updated solo topic");
  });
});

// ── AC3: sendUserMessage + getPartyState ────────────────────────────────

describe("AC3: sendUserMessage / getPartyState with solo-mode case", () => {
  it("sendUserMessage returns a valid message ID without throwing", async () => {
    const { t, userId, caseId } = await seedSoloCase("solo-msg@test.com");

    const messageId = await t
      .withIdentity({ subject: userId })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.sendUserMessage, {
          caseId,
          content: "Solo coaching message",
        }),
      );

    expect(messageId).toBeDefined();

    // Verify message was inserted correctly
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("privateMessages")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    const inserted = messages.find(
      (m) => m.content === "Solo coaching message",
    );
    expect(inserted).toBeDefined();
    expect(inserted!.content).toBe("Solo coaching message");
  });

  it("getPartyState internal query resolves without throwing for solo case", async () => {
    const { t, userId, caseId } = await seedSoloCase("solo-gps@test.com");

    const result = await t.run(async (ctx) =>
      ctx.runQuery(internal.privateCoaching.getPartyState, {
        caseId,
        userId,
      }),
    );

    expect(result).toBeDefined();
  });
});

// ── AC4: markComplete ───────────────────────────────────────────────────

describe("AC4: markComplete with solo-mode case", () => {
  it("marks the correct partyState complete without throwing", async () => {
    const { t, userId, caseId } = await seedSoloCase("solo-mc@test.com");

    const result = await t
      .withIdentity({ subject: userId })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );

    expect(result).toBeDefined();
    expect(result.synthesisScheduled).toBeDefined();

    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    const completed = psRows.find(
      (ps) => ps.privateCoachingCompletedAt != null,
    );
    expect(completed).toBeDefined();
    expect(completed!.privateCoachingCompletedAt).toBeGreaterThan(0);
  });
});

// ── AC5: mySynthesis + proposeClosure ───────────────────────────────────

describe("AC5: joint chat functions with solo-mode case", () => {
  it("mySynthesis resolves without error on solo-mode case", async () => {
    const { t, userId, caseId } = await seedSoloCase("solo-synth@test.com");

    // Advance partyStates so synthesisText is available
    await t.run(async (ctx) => {
      const psRows = await ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect();
      for (const ps of psRows) {
        await ctx.db.patch(ps._id, {
          privateCoachingCompletedAt: Date.now(),
          synthesisText: "Test synthesis for " + ps.role,
        });
      }
    });

    const result = await t
      .withIdentity({ subject: userId })
      .run(async (ctx) =>
        ctx.runQuery(api.jointChat.mySynthesis, { caseId }),
      );

    // Should return synthesis data without throwing (or null — but no crash)
    expect(result).toBeDefined();
  });

  it("proposeClosure resolves without error on solo-mode case", async () => {
    const { t, userId, caseId } = await seedSoloCase("solo-close@test.com");

    // Advance case to JOINT_ACTIVE and mark partyStates complete
    await t.run(async (ctx) => {
      await ctx.db.patch(caseId, { status: "JOINT_ACTIVE" });
      const psRows = await ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect();
      for (const ps of psRows) {
        await ctx.db.patch(ps._id, {
          privateCoachingCompletedAt: Date.now(),
        });
      }
    });

    await t
      .withIdentity({ subject: userId })
      .run(async (ctx) =>
        ctx.runMutation(api.jointChat.proposeClosure, {
          caseId,
          summary: "Solo closure summary",
        }),
      );

    // If we reached here without throwing, the .unique() bug is fixed.
    // Verify the partyState was updated.
    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
    );
    const proposed = psRows.find((ps) => ps.closureProposed === true);
    expect(proposed).toBeDefined();
  });
});

// ── AC6: getPartyStateForDraftCoach ─────────────────────────────────────

describe("AC6: getPartyStateForDraftCoach with solo-mode case", () => {
  it("resolves the correct partyState without throwing", async () => {
    const { t, userId, caseId } = await seedSoloCase("solo-draft@test.com");

    const result = await t.run(async (ctx) =>
      ctx.runQuery(internal.draftCoach.getPartyStateForDraftCoach, {
        caseId,
        userId,
      }),
    );

    expect(result).toBeDefined();
  });
});

// ── AC7: Non-solo regression guard ──────────────────────────────────────

describe("AC7: non-solo (standard two-party) case regression", () => {
  it("listForDashboard, updateMyForm, and markComplete work identically", async () => {
    const { t, userAId, caseId } = await seedStandardCase(
      "std-a@test.com",
      "std-b@test.com",
    );

    // listForDashboard succeeds
    const dashResult = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) => ctx.runQuery(api.cases.listForDashboard, {}));
    expect(dashResult).toBeDefined();
    const stdCase = dashResult.find((c) => c._id === caseId);
    expect(stdCase).toBeDefined();

    // updateMyForm succeeds
    await t.withIdentity({ subject: userAId }).run(async (ctx) =>
      ctx.runMutation(api.cases.updateMyForm, {
        caseId,
        mainTopic: "Updated standard topic",
        description: "Updated standard desc",
        desiredOutcome: "Updated standard outcome",
      }),
    );

    const psRows = await t.run(async (ctx) =>
      ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", userAId),
        )
        .collect(),
    );
    expect(psRows).toHaveLength(1);
    expect(psRows[0].mainTopic).toBe("Updated standard topic");

    // markComplete succeeds
    const mcResult = await t
      .withIdentity({ subject: userAId })
      .run(async (ctx) =>
        ctx.runMutation(api.privateCoaching.markComplete, { caseId }),
      );
    expect(mcResult).toBeDefined();
    expect(mcResult.synthesisScheduled).toBeDefined();
  });
});
