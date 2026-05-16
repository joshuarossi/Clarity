import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * WOR-136: Abandoned case cron job
 *
 * Integration tests using convex-test verifying the scanAndCloseAbandoned
 * internal mutation and cron registration.
 */

// ── Constants ─────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Seeds a test environment with users, a template version, and cases with
 * controlled timestamps for abandoned-case testing.
 */
async function seedTestEnv() {
  const t = convexTest(schema);

  const now = Date.now();

  // Create users
  const initiatorId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "initiator@test.com",
      displayName: "Initiator",
      role: "USER",
      createdAt: now,
    }),
  );

  const inviteeId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "invitee@test.com",
      displayName: "Invitee",
      role: "USER",
      createdAt: now,
    }),
  );

  // Create template + version (required for case creation)
  const templateVersionId = await t.run(async (ctx) => {
    const tplId = await ctx.db.insert("templates", {
      category: "workplace",
      name: "Workplace Template",
      createdAt: now,
      createdByUserId: initiatorId,
    });
    const vId = await ctx.db.insert("templateVersions", {
      templateId: tplId,
      version: 1,
      globalGuidance: "Test guidance",
      publishedAt: now,
      publishedByUserId: initiatorId,
    });
    await ctx.db.patch(tplId, { currentVersionId: vId });
    return vId;
  });

  return { t, now, initiatorId, inviteeId, templateVersionId };
}

/**
 * Inserts a case with the given status and updatedAt timestamp.
 */
async function insertCase(
  t: ReturnType<typeof convexTest>,
  opts: {
    status: "DRAFT_PRIVATE_COACHING" | "BOTH_PRIVATE_COACHING" | "READY_FOR_JOINT" | "JOINT_ACTIVE" | "CLOSED_RESOLVED" | "CLOSED_UNRESOLVED" | "CLOSED_ABANDONED";
    updatedAt: number;
    initiatorUserId: Id<"users">;
    inviteeUserId?: Id<"users">;
    templateVersionId: Id<"templateVersions">;
  },
) {
  return t.run(async (ctx) =>
    ctx.db.insert("cases", {
      schemaVersion: 1 as const,
      status: opts.status,
      isSolo: false,
      category: "workplace",
      templateVersionId: opts.templateVersionId,
      initiatorUserId: opts.initiatorUserId,
      inviteeUserId: opts.inviteeUserId,
      createdAt: opts.updatedAt - ONE_DAY_MS,
      updatedAt: opts.updatedAt,
    }),
  );
}

// ── AC 1: Cron definition ─────────────────────────────────────────────────

describe("AC 1: convex/crons.ts defines a daily cron for abandoned case scan", () => {
  it("exports a default cronJobs instance with a daily schedule targeting scanAndCloseAbandoned", async () => {
    const cronsModule = await import("../../convex/crons");
    const cronConfig = cronsModule.default;

    // Must be a Crons instance (created by cronJobs())
    expect(cronConfig).toBeDefined();
    expect(cronConfig.isCrons).toBe(true);

    // Must have at least one registered cron job
    const jobs = Object.values(cronConfig.crons);
    expect(jobs.length).toBeGreaterThanOrEqual(1);

    // Find the job targeting scanAndCloseAbandoned
    const abandonedJob = jobs.find(
      (job) =>
        typeof job === "object" &&
        job !== null &&
        "name" in job &&
        typeof job.name === "string" &&
        job.name.includes("scanAndCloseAbandoned"),
    );
    expect(abandonedJob).toBeDefined();

    // Verify the schedule is daily
    const schedule = (abandonedJob as { schedule: { type: string } }).schedule;
    expect(schedule.type).toBe("daily");
  });
});

// ── AC 2: Query filter — only JOINT_ACTIVE + stale updatedAt ──────────────

describe("AC 2: Scan queries for JOINT_ACTIVE cases with updatedAt older than 30 days", () => {
  it("does not touch cases in other statuses even if updatedAt is old", async () => {
    const { t, now, initiatorId, inviteeId, templateVersionId } =
      await seedTestEnv();

    const staleTimestamp = now - 31 * ONE_DAY_MS;

    // Insert cases in various statuses, all with stale updatedAt
    await insertCase(t, {
      status: "DRAFT_PRIVATE_COACHING",
      updatedAt: staleTimestamp,
      initiatorUserId: initiatorId,
      templateVersionId,
    });
    await insertCase(t, {
      status: "BOTH_PRIVATE_COACHING",
      updatedAt: staleTimestamp,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });
    await insertCase(t, {
      status: "CLOSED_RESOLVED",
      updatedAt: staleTimestamp,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });

    // Run the scan
    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    // All cases should remain unchanged
    const allCases = await t.run(async (ctx) => ctx.db.query("cases").collect());
    expect(allCases).toHaveLength(3);
    expect(allCases[0].status).toBe("DRAFT_PRIVATE_COACHING");
    expect(allCases[1].status).toBe("BOTH_PRIVATE_COACHING");
    expect(allCases[2].status).toBe("CLOSED_RESOLVED");
  });

  it("does not close a JOINT_ACTIVE case with recent activity", async () => {
    const { t, now, initiatorId, inviteeId, templateVersionId } =
      await seedTestEnv();

    // Case updated 10 days ago — well within the 30-day window
    await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: now - 10 * ONE_DAY_MS,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    const allCases = await t.run(async (ctx) => ctx.db.query("cases").collect());
    expect(allCases).toHaveLength(1);
    expect(allCases[0].status).toBe("JOINT_ACTIVE");
  });

  it("processes no cases when none match the criteria", async () => {
    const { t } = await seedTestEnv();

    // No cases seeded — scan should complete without error
    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    const allCases = await t.run(async (ctx) => ctx.db.query("cases").collect());
    expect(allCases).toHaveLength(0);
  });
});

// ── AC 3: State transition via state machine helper ───────────────────────

describe("AC 3: Matching cases are transitioned to CLOSED_ABANDONED via state machine", () => {
  it("transitions a stale JOINT_ACTIVE case to CLOSED_ABANDONED with closedAt set", async () => {
    const { t, now, initiatorId, inviteeId, templateVersionId } =
      await seedTestEnv();

    await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: now - 31 * ONE_DAY_MS,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    const allCases = await t.run(async (ctx) => ctx.db.query("cases").collect());
    expect(allCases).toHaveLength(1);
    expect(allCases[0].status).toBe("CLOSED_ABANDONED");
    expect(allCases[0].closedAt).toBeTypeOf("number");
    expect(allCases[0].updatedAt).toBeGreaterThanOrEqual(now);
  });

  it("transitions multiple stale JOINT_ACTIVE cases in one scan", async () => {
    const { t, now, initiatorId, inviteeId, templateVersionId } =
      await seedTestEnv();

    const staleTimestamp = now - 35 * ONE_DAY_MS;

    await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: staleTimestamp,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });
    await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: staleTimestamp - 5 * ONE_DAY_MS,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    const allCases = await t.run(async (ctx) => ctx.db.query("cases").collect());
    expect(allCases).toHaveLength(2);
    for (const c of allCases) {
      expect(c.status).toBe("CLOSED_ABANDONED");
      expect(c.closedAt).toBeTypeOf("number");
    }
  });
});

// ── AC 4: Notifications for affected parties ──────────────────────────────

describe("AC 4: Affected parties are notified via dashboard badge", () => {
  it("creates notification records for both initiator and invitee", async () => {
    const { t, now, initiatorId, inviteeId, templateVersionId } =
      await seedTestEnv();

    const caseId = await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: now - 31 * ONE_DAY_MS,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect(),
    );

    expect(notifications).toHaveLength(2);

    const initiatorNotif = notifications.find(
      (n) => n.userId === initiatorId,
    );
    const inviteeNotif = notifications.find(
      (n) => n.userId === inviteeId,
    );

    expect(initiatorNotif).toBeDefined();
    expect(initiatorNotif!.caseId).toBe(caseId);
    expect(initiatorNotif!.type).toBe("CASE_ABANDONED");
    expect(initiatorNotif!.read).toBe(false);
    expect(initiatorNotif!.createdAt).toBeTypeOf("number");

    expect(inviteeNotif).toBeDefined();
    expect(inviteeNotif!.caseId).toBe(caseId);
    expect(inviteeNotif!.type).toBe("CASE_ABANDONED");
    expect(inviteeNotif!.read).toBe(false);
  });

  it("creates only one notification for a solo case (no invitee)", async () => {
    const { t, now, initiatorId, templateVersionId } = await seedTestEnv();

    await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: now - 31 * ONE_DAY_MS,
      initiatorUserId: initiatorId,
      // No inviteeUserId — solo case
      templateVersionId,
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect(),
    );

    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId).toBe(initiatorId);
    expect(notifications[0].type).toBe("CASE_ABANDONED");
    expect(notifications[0].read).toBe(false);
  });
});

// ── AC 5: Boundary test — recent vs stale ─────────────────────────────────

describe("AC 5: Case with recent activity NOT closed, case with 31-day-old activity IS closed", () => {
  it("only transitions the stale case while leaving the recent one untouched", async () => {
    const { t, now, initiatorId, inviteeId, templateVersionId } =
      await seedTestEnv();

    // Case updated 29 days ago — should NOT be closed
    const recentCaseId = await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: now - 29 * ONE_DAY_MS,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });

    // Case updated 31 days ago — should be closed
    const staleCaseId = await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: now - 31 * ONE_DAY_MS,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    const recentCase = await t.run(async (ctx) => ctx.db.get(recentCaseId));
    const staleCase = await t.run(async (ctx) => ctx.db.get(staleCaseId));

    expect(recentCase).not.toBeNull();
    expect(recentCase!.status).toBe("JOINT_ACTIVE");
    expect(recentCase!.closedAt).toBeUndefined();

    expect(staleCase).not.toBeNull();
    expect(staleCase!.status).toBe("CLOSED_ABANDONED");
    expect(staleCase!.closedAt).toBeTypeOf("number");
  });

  it("case at exactly 30 days boundary IS closed (<=)", async () => {
    const { t, now, initiatorId, inviteeId, templateVersionId } =
      await seedTestEnv();

    // Case updated exactly 30 days ago — at the boundary, should be closed
    const boundaryCaseId = await insertCase(t, {
      status: "JOINT_ACTIVE",
      updatedAt: now - THIRTY_DAYS_MS,
      initiatorUserId: initiatorId,
      inviteeUserId: inviteeId,
      templateVersionId,
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(internal.abandonedCases.scanAndCloseAbandoned, {});
    });

    const boundaryCase = await t.run(async (ctx) =>
      ctx.db.get(boundaryCaseId),
    );

    expect(boundaryCase).not.toBeNull();
    expect(boundaryCase!.status).toBe("CLOSED_ABANDONED");
  });
});
