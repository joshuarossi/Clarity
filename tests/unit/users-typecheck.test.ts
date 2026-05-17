import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

/**
 * WOR-164: users.me must use getAuthUserId(ctx) from @convex-dev/auth/server
 * to resolve the user ID from the composite subject ("userId|sessionId"),
 * NOT raw identity.subject.
 *
 * Tests use withIdentity({ subject: `${userId}|${sessionId}` }) to exercise
 * the composite format. At red state, users.me passes the full composite
 * string to db.get() → "Invalid ID length 65".
 */

/** A fake session ID to build composite subjects like production @convex-dev/auth */
const fakeSessionId = "s1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6";

// ── AC3: users.me uses getAuthUserId(ctx) to resolve user from composite subject ──

describe("AC3 — users.me uses getAuthUserId", () => {
  it("returns the matching user document when composite subject contains a valid user _id", async () => {
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
      .withIdentity({ subject: `${insertedUserId}|${fakeSessionId}` })
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

  it("returns null when composite subject does not match any user row", async () => {
    const t = convexTest(schema);
    const result = await t
      .withIdentity({ subject: `nonexistent_user_id|${fakeSessionId}` })
      .query(api.users.me, {});
    expect(result).toBeNull();
  });
});
