import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

/**
 * WOR-163: users.me resolves user by identity.subject instead of identity.email
 *
 * Tests use withIdentity({ subject: userId }) (no email field) to exercise
 * the subject-based resolution path. At red state, users.me still uses
 * identity.email which is undefined when only subject is provided, so the
 * query returns null — that is the expected red-state assertion error.
 */

// ── AC2: me returns the user doc when identity.subject matches ──────

describe("AC2 — me returns user doc via identity.subject", () => {
  it("returns the matching user document when identity.subject is a valid user _id", async () => {
    const t = convexTest(schema);
    const insertedUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "alice@example.com",
        role: "USER",
        displayName: "alice",
        createdAt: Date.now(),
      });
    });
    const result = await t
      .withIdentity({ subject: insertedUserId })
      .query(api.users.me, {});
    expect(result).not.toBeNull();
    expect(result!._id).toEqual(insertedUserId);
    expect(result!.email).toBe("alice@example.com");
  });

  it("returns null when unauthenticated (no identity)", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.users.me, {});
    expect(result).toBeNull();
  });

  it("returns null when identity.subject does not match any user row", async () => {
    const t = convexTest(schema);
    const result = await t
      .withIdentity({ subject: "nonexistent_user_id" })
      .query(api.users.me, {});
    expect(result).toBeNull();
  });
});
