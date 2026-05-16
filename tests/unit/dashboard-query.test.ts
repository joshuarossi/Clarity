import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { anyApi } from "convex/server";

// Use anyApi instead of the generated typed api because listForDashboard
// does not exist yet — it will be created by the implementation agent.
// anyApi is Convex's untyped API reference that accepts any property path.
const api = anyApi;

/**
 * WOR-116: listForDashboard query tests
 *
 * Tests cover the new listForDashboard query defined in convex/cases.ts.
 * At red state, the query does not exist yet so convex-test will throw
 * when attempting to call it — that is the expected red-state failure.
 */

// ── Helpers ─────────────────────────────────────────────────────────────

async function seedUser(
  t: ReturnType<typeof convexTest>,
  email: string,
  displayName: string,
) {
  return t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      email,
      displayName,
      role: "USER",
      createdAt: Date.now(),
    });
    return (await ctx.db.get(id))!;
  });
}

async function seedTemplate(t: ReturnType<typeof convexTest>, adminId: string) {
  return t.run(async (ctx) => {
    const templateId = await ctx.db.insert("templates", {
      category: "workplace",
      name: "Workplace Default",
      createdAt: Date.now(),
      createdByUserId: adminId,
    } as Record<string, unknown>);

    const versionId = await ctx.db.insert("templateVersions", {
      templateId,
      version: 1,
      globalGuidance: "Default guidance",
      publishedAt: Date.now(),
      publishedByUserId: adminId,
    } as Record<string, unknown>);

    await ctx.db.patch(templateId, { currentVersionId: versionId });
    return { templateId, versionId };
  });
}

const NOW = 1_700_000_000_000;

async function seedCase(
  t: ReturnType<typeof convexTest>,
  opts: {
    status: string;
    isSolo: boolean;
    initiatorId: string;
    inviteeId?: string;
    templateVersionId: string;
    createdAt: number;
    updatedAt: number;
  },
) {
  return t.run(async (ctx) => {
    const caseId = await ctx.db.insert("cases", {
      schemaVersion: 1,
      status: opts.status,
      isSolo: opts.isSolo,
      category: "workplace",
      templateVersionId: opts.templateVersionId,
      initiatorUserId: opts.initiatorId,
      inviteeUserId: opts.inviteeId,
      createdAt: opts.createdAt,
      updatedAt: opts.updatedAt,
    } as Record<string, unknown>);
    return caseId;
  });
}

async function seedPartyState(
  t: ReturnType<typeof convexTest>,
  opts: {
    caseId: string;
    userId: string;
    role: "INITIATOR" | "INVITEE";
    privateCoachingCompletedAt?: number;
  },
) {
  return t.run(async (ctx) => {
    await ctx.db.insert("partyStates", {
      caseId: opts.caseId,
      userId: opts.userId,
      role: opts.role,
      privateCoachingCompletedAt: opts.privateCoachingCompletedAt,
    } as Record<string, unknown>);
  });
}

// ── AC: listForDashboard returns enriched cases ─────────────────────────

describe("AC: listForDashboard returns enriched case data", () => {
  it("returns otherPartyName, otherPartyRole, statusVariant, statusLabel", async () => {
    const t = convexTest(schema);

    const alice = await seedUser(t, "alice@test.com", "Alice");
    const bob = await seedUser(t, "bob@test.com", "Bob");
    const { versionId } = await seedTemplate(t, alice._id);

    const caseId = await seedCase(t, {
      status: "BOTH_PRIVATE_COACHING",
      isSolo: false,
      initiatorId: alice._id,
      inviteeId: bob._id,
      templateVersionId: versionId,
      createdAt: NOW - 86_400_000,
      updatedAt: NOW,
    });

    await seedPartyState(t, {
      caseId,
      userId: alice._id,
      role: "INITIATOR",
    });
    await seedPartyState(t, {
      caseId,
      userId: bob._id,
      role: "INVITEE",
    });

    const asAlice = t.withIdentity({ email: "alice@test.com" });
    const result = await asAlice.query(api.cases.listForDashboard, {});

    expect(result).toHaveLength(1);
    expect(result[0].otherPartyName).toBe("Bob");
    expect(result[0].otherPartyRole).toBe("invitee");
    expect(result[0].statusVariant).toBe("pill-turn");
    expect(result[0].statusLabel).toBe("Your turn");
    expect(result[0].category).toBe("workplace");
    expect(result[0].isSolo).toBe(false);
  });
});

// ── AC: pill-turn vs pill-waiting in BOTH_PRIVATE_COACHING ──────────────

describe("AC: Correct pill-turn vs pill-waiting in BOTH_PRIVATE_COACHING", () => {
  it("returns pill-turn when caller has NOT completed private coaching", async () => {
    const t = convexTest(schema);

    const alice = await seedUser(t, "alice@test.com", "Alice");
    const bob = await seedUser(t, "bob@test.com", "Bob");
    const { versionId } = await seedTemplate(t, alice._id);

    const caseId = await seedCase(t, {
      status: "BOTH_PRIVATE_COACHING",
      isSolo: false,
      initiatorId: alice._id,
      inviteeId: bob._id,
      templateVersionId: versionId,
      createdAt: NOW - 86_400_000,
      updatedAt: NOW,
    });

    // Alice has NOT completed PC
    await seedPartyState(t, {
      caseId,
      userId: alice._id,
      role: "INITIATOR",
    });
    await seedPartyState(t, {
      caseId,
      userId: bob._id,
      role: "INVITEE",
    });

    const asAlice = t.withIdentity({ email: "alice@test.com" });
    const result = await asAlice.query(api.cases.listForDashboard, {});

    expect(result[0].statusVariant).toBe("pill-turn");
    expect(result[0].statusLabel).toBe("Your turn");
  });

  it("returns pill-waiting when caller HAS completed private coaching", async () => {
    const t = convexTest(schema);

    const alice = await seedUser(t, "alice@test.com", "Alice");
    const bob = await seedUser(t, "bob@test.com", "Bob");
    const { versionId } = await seedTemplate(t, alice._id);

    const caseId = await seedCase(t, {
      status: "BOTH_PRIVATE_COACHING",
      isSolo: false,
      initiatorId: alice._id,
      inviteeId: bob._id,
      templateVersionId: versionId,
      createdAt: NOW - 86_400_000,
      updatedAt: NOW,
    });

    // Alice HAS completed PC
    await seedPartyState(t, {
      caseId,
      userId: alice._id,
      role: "INITIATOR",
      privateCoachingCompletedAt: NOW - 3_600_000,
    });
    // Bob has NOT completed PC
    await seedPartyState(t, {
      caseId,
      userId: bob._id,
      role: "INVITEE",
    });

    const asAlice = t.withIdentity({ email: "alice@test.com" });
    const result = await asAlice.query(api.cases.listForDashboard, {});

    expect(result[0].statusVariant).toBe("pill-waiting");
    expect(result[0].statusLabel).toBe("Waiting");
  });
});

// ── AC: otherPartyName is null when invitee hasn't joined ───────────────

describe("AC: otherPartyName null when invitee hasn't joined", () => {
  it("returns otherPartyName as null when inviteeUserId is not set", async () => {
    const t = convexTest(schema);

    const alice = await seedUser(t, "alice@test.com", "Alice");
    const { versionId } = await seedTemplate(t, alice._id);

    const caseId = await seedCase(t, {
      status: "DRAFT_PRIVATE_COACHING",
      isSolo: false,
      initiatorId: alice._id,
      // no inviteeId
      templateVersionId: versionId,
      createdAt: NOW - 86_400_000,
      updatedAt: NOW,
    });

    await seedPartyState(t, {
      caseId,
      userId: alice._id,
      role: "INITIATOR",
    });

    const asAlice = t.withIdentity({ email: "alice@test.com" });
    const result = await asAlice.query(api.cases.listForDashboard, {});

    expect(result).toHaveLength(1);
    expect(result[0].otherPartyName).toBeNull();
    expect(result[0].otherPartyRole).toBe("invitee");
  });
});

// ── AC: Sorted by updatedAt descending ──────────────────────────────────

describe("AC: Results sorted by updatedAt descending", () => {
  it("returns cases ordered by updatedAt descending", async () => {
    const t = convexTest(schema);

    const alice = await seedUser(t, "alice@test.com", "Alice");
    const bob = await seedUser(t, "bob@test.com", "Bob");
    const { versionId } = await seedTemplate(t, alice._id);

    // Older case
    const caseOld = await seedCase(t, {
      status: "BOTH_PRIVATE_COACHING",
      isSolo: false,
      initiatorId: alice._id,
      inviteeId: bob._id,
      templateVersionId: versionId,
      createdAt: NOW - 86_400_000 * 5,
      updatedAt: NOW - 86_400_000,
    });
    await seedPartyState(t, { caseId: caseOld, userId: alice._id, role: "INITIATOR" });
    await seedPartyState(t, { caseId: caseOld, userId: bob._id, role: "INVITEE" });

    // Newer case
    const caseNew = await seedCase(t, {
      status: "READY_FOR_JOINT",
      isSolo: false,
      initiatorId: alice._id,
      inviteeId: bob._id,
      templateVersionId: versionId,
      createdAt: NOW - 86_400_000 * 2,
      updatedAt: NOW,
    });
    await seedPartyState(t, { caseId: caseNew, userId: alice._id, role: "INITIATOR" });
    await seedPartyState(t, { caseId: caseNew, userId: bob._id, role: "INVITEE" });

    const asAlice = t.withIdentity({ email: "alice@test.com" });
    const result = await asAlice.query(api.cases.listForDashboard, {});

    expect(result).toHaveLength(2);
    // First result should be the newer case (higher updatedAt)
    expect(result[0].updatedAt).toBeGreaterThan(result[1].updatedAt);
    expect(result[0]._id).toBe(caseNew);
  });
});

// ── AC: Requires authentication ─────────────────────────────────────────

describe("AC: listForDashboard requires authentication", () => {
  it("throws for unauthenticated callers", async () => {
    const t = convexTest(schema);

    await expect(
      t.query(api.cases.listForDashboard, {}),
    ).rejects.toThrow();
  });
});
