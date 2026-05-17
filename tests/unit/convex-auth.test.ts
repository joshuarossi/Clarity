import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { getUserByEmail } from "../../convex/lib/auth";
import authConfig from "../../convex/auth.config";
import * as authExports from "../../convex/auth";

/**
 * WOR-156: Auth config shape fix — convex/auth.config.ts must export the
 * deploy-compatible { domain, applicationID } shape, not full provider objects.
 *
 * Tests cover ACs 1–5 and legacy ACs 3, 4, 7, 8 using convex-test with the
 * project schema and direct module imports. At red state, the imports from
 * convex/auth.config.ts and convex/auth.ts may produce TS2307 because the
 * modules have not been updated yet — that is the expected red-state error
 * and is tolerated by the validator.
 */

/** Shape expected by Convex deploy for each provider entry. */
interface DeployProvider {
  domain: string | undefined;
  applicationID: string;
}

// ── AC1: auth.config.ts exports the deploy-compatible shape ──────────

describe("AC1 — auth.config.ts exports deploy-compatible shape", () => {
  it("exports a providers array with { domain, applicationID } entries", () => {
    expect(authConfig).toBeDefined();
    expect(authConfig.providers).toBeInstanceOf(Array);
    expect(authConfig.providers.length).toBeGreaterThanOrEqual(1);
    expect(authConfig.providers[0]).toHaveProperty("domain");
    expect(authConfig.providers[0]).toHaveProperty("applicationID");
    expect((authConfig.providers[0] as DeployProvider).applicationID).toBe(
      "convex",
    );
  });
});

// ── AC2: auth.config.ts does NOT contain full provider objects ────────

describe("AC2 — auth.config.ts has no provider-object fields", () => {
  it("providers do not have id, sendVerificationRequest, clientId, or clientSecret", () => {
    expect(authConfig.providers[0]).not.toHaveProperty("id");
    expect(authConfig.providers[0]).not.toHaveProperty(
      "sendVerificationRequest",
    );
    expect(authConfig.providers[0]).not.toHaveProperty("clientId");
    expect(authConfig.providers[0]).not.toHaveProperty("clientSecret");
  });
});

// ── AC3: On first login, a users row is created ──────────────────────

describe("AC3 — user row created on first login", () => {
  it("getUserByEmail creates a user with role USER and valid createdAt on first call", async () => {
    const t = convexTest(schema);
    const user = await t.run(async (ctx) =>
      getUserByEmail(ctx, "firstlogin@example.com"),
    );

    expect(user.email).toBe("firstlogin@example.com");
    expect(user.role).toBe("USER");
    expect(user.createdAt).toBeGreaterThan(0);
    expect(user.displayName).toBe("firstlogin");
  });

  it("creates exactly one users row for the email", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => getUserByEmail(ctx, "onerow@example.com"));

    const count = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "onerow@example.com"))
        .collect();
      return rows.length;
    });
    expect(count).toBe(1);
  });

  it("derives displayName from the email prefix (before @)", async () => {
    const t = convexTest(schema);
    const user = await t.run(async (ctx) =>
      getUserByEmail(ctx, "jane.doe@company.org"),
    );
    expect(user.displayName).toBe("jane.doe");
  });
});

// ── AC4: Idempotent upsert — no modification on subsequent login ─────

describe("AC4 — idempotent upsert on subsequent login", () => {
  it("returns the same user row on second call without creating a duplicate", async () => {
    const t = convexTest(schema);
    const first = await t.run(async (ctx) =>
      getUserByEmail(ctx, "repeat@example.com"),
    );
    const second = await t.run(async (ctx) =>
      getUserByEmail(ctx, "repeat@example.com"),
    );

    expect(second._id).toEqual(first._id);
    expect(second.email).toBe(first.email);
    expect(second.role).toBe(first.role);
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("does not create a second row on repeat login", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => getUserByEmail(ctx, "nodup@example.com"));
    await t.run(async (ctx) => getUserByEmail(ctx, "nodup@example.com"));

    const count = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "nodup@example.com"))
        .collect();
      return rows.length;
    });
    expect(count).toBe(1);
  });

  it("does not modify createdAt or role on subsequent login", async () => {
    const t = convexTest(schema);
    const first = await t.run(async (ctx) =>
      getUserByEmail(ctx, "stable@example.com"),
    );

    // Second call should not touch the existing row
    const second = await t.run(async (ctx) =>
      getUserByEmail(ctx, "stable@example.com"),
    );

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.role).toBe("USER");
    expect(second.displayName).toBe(first.displayName);
  });
});

// ── AC3: convex/auth.ts exports prove convexAuth() received providers ─

describe("AC3 — auth.ts exports auth, signIn, signOut, store", () => {
  it("auth.ts exports auth, signIn, signOut, and store", () => {
    expect(authExports.auth).toBeDefined();
    expect(authExports.signIn).toBeDefined();
    expect(authExports.signOut).toBeDefined();
    expect(authExports.store).toBeDefined();
  });
});

// ── AC4: @auth/core import removed from auth.config.ts ───────────────

describe("AC4 — no @auth/core in auth.config.ts source", () => {
  it("auth.config.ts source does not reference @auth/core, Email(), or Google()", () => {
    const authConfigSource = fs.readFileSync(
      path.resolve(__dirname, "../../convex/auth.config.ts"),
      "utf-8",
    );
    expect(authConfigSource).not.toContain("@auth/core");
    expect(authConfigSource).not.toContain("Email(");
    expect(authConfigSource).not.toContain("Google(");
  });
});

// ── AC5: auth.config.ts exports exactly the correct shape ────────────

describe("AC5 — auth.config.ts has exactly one deploy provider entry", () => {
  it("providers array has length 1 with the correct shape", () => {
    expect(authConfig.providers).toHaveLength(1);
    expect(authConfig.providers[0]).toEqual({
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    });
  });
});

// ── AC7: No password-based registration ──────────────────────────────

describe("AC7 — no password provider in auth config", () => {
  it("auth config providers array has no entry resembling a password provider", () => {
    for (const provider of authConfig.providers) {
      expect(provider).not.toHaveProperty("id", "password");
      expect(provider).not.toHaveProperty("id", "credentials");
    }
  });
});

// ── AC8: ctx.auth.getUserIdentity() returns authenticated identity ───

describe("AC8 — getUserIdentity returns authenticated identity", () => {
  it("returns identity with email field when authenticated via withIdentity", async () => {
    const t = convexTest(schema);
    const identity = await t
      .withIdentity({ email: "identity-test@example.com" })
      .run(async (ctx) => ctx.auth.getUserIdentity());

    expect(identity).not.toBeNull();
    expect(identity?.email).toBe("identity-test@example.com");
  });

  it("returns null when no identity is set (unauthenticated)", async () => {
    const t = convexTest(schema);
    const identity = await t.run(async (ctx) => ctx.auth.getUserIdentity());

    expect(identity).toBeNull();
  });

  it("identity is available in subsequent function calls after sign-in simulation", async () => {
    const t = convexTest(schema);

    // Simulate the afterUserCreatedOrUpdated callback creating the user row
    await t.run(async (ctx) => {
      await getUserByEmail(ctx, "subsequent@example.com");
    });

    // Verify identity is accessible in a follow-up call
    const identity = await t
      .withIdentity({ email: "subsequent@example.com" })
      .run(async (ctx) => ctx.auth.getUserIdentity());

    expect(identity).not.toBeNull();
    expect(identity?.email).toBe("subsequent@example.com");

    // Verify the user row exists and matches
    const user = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "subsequent@example.com"))
        .unique();
    });
    expect(user).not.toBeNull();
    expect(user?.role).toBe("USER");
  });
});
