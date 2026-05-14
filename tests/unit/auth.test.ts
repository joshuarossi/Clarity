import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "../../convex/schema";
import {
  requireAuth,
  getUserByEmail,
  requirePartyToCase,
  requireAdmin,
} from "../../convex/lib/auth";

/**
 * WOR-97: Auth identity helper and authorization utilities tests
 *
 * Tests cover all 6 acceptance criteria using convex-test with the project
 * schema. At red state, the import from convex/lib/auth.ts produces TS2307
 * because the module has not been created yet — that is the expected
 * red-state error and is tolerated by the validator.
 */

/** Error shape from TechSpec §7.4 used by all auth helpers */
type AuthErrorData = { code: string; message: string; httpStatus: number };

// ── AC1: requireAuth returns user or throws UNAUTHENTICATED ───────────

describe("AC1 — requireAuth", () => {
  it("returns the user doc when identity and user row exist", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "alice@example.com",
        role: "USER",
        displayName: "alice",
        createdAt: Date.now(),
      });
    });
    const user = await t
      .withIdentity({ email: "alice@example.com" })
      .run(async (ctx) => requireAuth(ctx));
    expect(user.email).toBe("alice@example.com");
    expect(user.role).toBe("USER");
  });

  it("throws UNAUTHENTICATED (401) when no identity", async () => {
    const t = convexTest(schema);
    expect.assertions(4);
    try {
      await t.run(async (ctx) => {
        await requireAuth(ctx);
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConvexError);
      const e = err as ConvexError<AuthErrorData>;
      expect(e.data.code).toBe("UNAUTHENTICATED");
      expect(e.data.httpStatus).toBe(401);
      expect(e.data.message).toBeTruthy();
    }
  });

  it("throws UNAUTHENTICATED (401) when identity exists but no user row", async () => {
    const t = convexTest(schema);
    expect.assertions(4);
    try {
      await t
        .withIdentity({ email: "ghost@example.com" })
        .run(async (ctx) => {
          await requireAuth(ctx);
        });
    } catch (err) {
      expect(err).toBeInstanceOf(ConvexError);
      const e = err as ConvexError<AuthErrorData>;
      expect(e.data.code).toBe("UNAUTHENTICATED");
      expect(e.data.httpStatus).toBe(401);
      expect(e.data.message).toBeTruthy();
    }
  });
});

// ── AC2: getUserByEmail upserts on first login ────────────────────────

describe("AC2 — getUserByEmail", () => {
  it("creates a new user with role USER on first call for an email", async () => {
    const t = convexTest(schema);
    const user = await t.run(async (ctx) =>
      getUserByEmail(ctx, "new@example.com"),
    );
    expect(user.email).toBe("new@example.com");
    expect(user.role).toBe("USER");
    expect(user.displayName).toBe("new");

    // Verify exactly one row exists for this email
    const count = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "new@example.com"))
        .collect();
      return rows.length;
    });
    expect(count).toBe(1);
  });

  it("returns the existing user on second call (idempotent, no duplicate)", async () => {
    const t = convexTest(schema);
    const first = await t.run(async (ctx) =>
      getUserByEmail(ctx, "dup@example.com"),
    );
    const second = await t.run(async (ctx) =>
      getUserByEmail(ctx, "dup@example.com"),
    );
    expect(second._id).toEqual(first._id);
    expect(second.email).toBe(first.email);
    expect(second.role).toBe(first.role);

    // Verify still exactly one row
    const count = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "dup@example.com"))
        .collect();
      return rows.length;
    });
    expect(count).toBe(1);
  });

  it("creates distinct rows for different emails", async () => {
    const t = convexTest(schema);
    const userA = await t.run(async (ctx) =>
      getUserByEmail(ctx, "a@example.com"),
    );
    const userB = await t.run(async (ctx) =>
      getUserByEmail(ctx, "b@example.com"),
    );
    expect(userA._id).not.toEqual(userB._id);
    expect(userA.email).toBe("a@example.com");
    expect(userB.email).toBe("b@example.com");
  });
});

// ── AC3: requirePartyToCase verifies party membership ─────────────────

describe("AC3 — requirePartyToCase", () => {
  /** Seeds a case with initiator, invitee, and an unrelated user. */
  async function seedCaseWithParties() {
    const t = convexTest(schema);
    const ids = await t.run(async (ctx) => {
      const initiatorId = await ctx.db.insert("users", {
        email: "initiator@example.com",
        role: "USER",
        displayName: "initiator",
        createdAt: Date.now(),
      });
      const inviteeId = await ctx.db.insert("users", {
        email: "invitee@example.com",
        role: "USER",
        displayName: "invitee",
        createdAt: Date.now(),
      });
      const unrelatedId = await ctx.db.insert("users", {
        email: "unrelated@example.com",
        role: "USER",
        displayName: "unrelated",
        createdAt: Date.now(),
      });
      const templateId = await ctx.db.insert("templates", {
        category: "test",
        name: "Test Template",
        createdAt: Date.now(),
        createdByUserId: initiatorId,
      });
      const templateVersionId = await ctx.db.insert("templateVersions", {
        templateId,
        version: 1,
        globalGuidance: "test guidance",
        publishedAt: Date.now(),
        publishedByUserId: initiatorId,
      });
      const caseId = await ctx.db.insert("cases", {
        schemaVersion: 1 as const,
        status: "DRAFT_PRIVATE_COACHING" as const,
        isSolo: false,
        category: "test",
        templateVersionId,
        initiatorUserId: initiatorId,
        inviteeUserId: inviteeId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { caseId, initiatorId, inviteeId, unrelatedId };
    });
    return { t, ...ids };
  }

  it("returns the case doc when userId matches initiatorUserId", async () => {
    const { t, caseId, initiatorId } = await seedCaseWithParties();
    const result = await t.run(async (ctx) =>
      requirePartyToCase(ctx, caseId, initiatorId),
    );
    expect(result._id).toEqual(caseId);
    expect(result.initiatorUserId).toEqual(initiatorId);
  });

  it("returns the case doc when userId matches inviteeUserId", async () => {
    const { t, caseId, inviteeId } = await seedCaseWithParties();
    const result = await t.run(async (ctx) =>
      requirePartyToCase(ctx, caseId, inviteeId),
    );
    expect(result._id).toEqual(caseId);
  });

  it("throws FORBIDDEN (403) when userId is neither party", async () => {
    const { t, caseId, unrelatedId } = await seedCaseWithParties();
    expect.assertions(4);
    try {
      await t.run(async (ctx) => {
        await requirePartyToCase(ctx, caseId, unrelatedId);
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConvexError);
      const e = err as ConvexError<AuthErrorData>;
      expect(e.data.code).toBe("FORBIDDEN");
      expect(e.data.httpStatus).toBe(403);
      expect(e.data.message).toBeTruthy();
    }
  });

  it("throws NOT_FOUND (404) when caseId does not exist", async () => {
    const t = convexTest(schema);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        displayName: "user",
        createdAt: Date.now(),
      });
      const templateId = await ctx.db.insert("templates", {
        category: "test",
        name: "Test",
        createdAt: Date.now(),
        createdByUserId: userId,
      });
      const tvId = await ctx.db.insert("templateVersions", {
        templateId,
        version: 1,
        globalGuidance: "test",
        publishedAt: Date.now(),
        publishedByUserId: userId,
      });
      const caseId = await ctx.db.insert("cases", {
        schemaVersion: 1 as const,
        status: "DRAFT_PRIVATE_COACHING" as const,
        isSolo: false,
        category: "test",
        templateVersionId: tvId,
        initiatorUserId: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.delete(caseId);
      return { userId, deletedCaseId: caseId };
    });

    expect.assertions(4);
    try {
      await t.run(async (ctx) => {
        await requirePartyToCase(ctx, ids.deletedCaseId, ids.userId);
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConvexError);
      const e = err as ConvexError<AuthErrorData>;
      expect(e.data.code).toBe("NOT_FOUND");
      expect(e.data.httpStatus).toBe(404);
      expect(e.data.message).toBeTruthy();
    }
  });
});

// ── AC4: requireAdmin checks server-side role ─────────────────────────

describe("AC4 — requireAdmin", () => {
  it("returns the user doc when role is ADMIN", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        displayName: "admin",
        createdAt: Date.now(),
      });
    });
    const user = await t
      .withIdentity({ email: "admin@example.com" })
      .run(async (ctx) => requireAdmin(ctx));
    expect(user.email).toBe("admin@example.com");
    expect(user.role).toBe("ADMIN");
  });

  it("throws FORBIDDEN (403) when role is USER", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "regular@example.com",
        role: "USER",
        displayName: "regular",
        createdAt: Date.now(),
      });
    });
    expect.assertions(4);
    try {
      await t
        .withIdentity({ email: "regular@example.com" })
        .run(async (ctx) => {
          await requireAdmin(ctx);
        });
    } catch (err) {
      expect(err).toBeInstanceOf(ConvexError);
      const e = err as ConvexError<AuthErrorData>;
      expect(e.data.code).toBe("FORBIDDEN");
      expect(e.data.httpStatus).toBe(403);
      expect(e.data.message).toBeTruthy();
    }
  });
});

// ── AC5: correct error codes on unauthorized access ───────────────────
// Fully covered by the error-path assertions in ACs 1–4 above. Each test
// verifies code, httpStatus, and non-empty message per TechSpec §7.4.

// ── AC6: no bypass by importing table directly ────────────────────────
// This is a design constraint enforced by convention. The tests above
// verify that all four helpers exist and function correctly, establishing
// them as the canonical access path. Enforcement that downstream Convex
// functions use these helpers instead of querying tables directly is a
// code-review concern, not a runtime-testable assertion.
