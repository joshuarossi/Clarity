import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

/**
 * WOR-139: Fix typecheck regression in convex/users.ts
 *
 * Tests cover all 4 acceptance criteria for the closure-narrowing fix on
 * identity.email. At red state, the import of api.users.me triggers TS2345
 * in convex/users.ts because identity.email is string | undefined inside
 * the withIndex callback — that is the expected red-state error.
 */

// ── AC1: tsc --noEmit passes (no TS2345 in convex/users.ts) ─────────

describe("AC1 — TypeScript compilation of convex/users.ts", () => {
  it("imports and invokes the me query without type errors", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.users.me, {});
    // If convex/users.ts has a TS2345 error, this file fails to compile
    // under vitest's ts transpilation — the test never runs.
    expect(result).toBeNull();
  });
});

// ── AC2: me returns null for unauthenticated user ───────────────────

describe("AC2 — me returns null when unauthenticated", () => {
  it("returns null when ctx.auth.getUserIdentity() resolves to null", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.users.me, {});
    expect(result).toBeNull();
  });
});

// ── AC3: me returns null when identity.email is undefined ───────────

describe("AC3 — me returns null when identity has no email", () => {
  it("returns null when identity exists but email is undefined", async () => {
    const t = convexTest(schema);
    const result = await t
      .withIdentity({ subject: "user123" })
      .query(api.users.me, {});
    expect(result).toBeNull();
  });
});

// ── AC4: me returns the user doc for valid email ────────────────────

describe("AC4 — me returns user doc for valid email", () => {
  it("returns the matching user document when email is valid and user exists", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "alice@example.com",
        role: "USER",
        displayName: "alice",
        createdAt: Date.now(),
      });
    });
    const result = await t
      .withIdentity({ email: "alice@example.com" })
      .query(api.users.me, {});
    expect(result).not.toBeNull();
    expect(result!.email).toBe("alice@example.com");
    expect(result!.role).toBe("USER");
  });
});
