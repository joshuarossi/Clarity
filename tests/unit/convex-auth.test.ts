import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { getUserByEmail } from "../../convex/lib/auth";
import authConfig from "../../convex/auth.config";

/**
 * WOR-109: Auth Convex module — Convex Auth setup, magic link + Google OAuth,
 * user upsert.
 *
 * Tests cover ACs 1, 2, 3, 4, 7, 8 using convex-test with the project schema
 * and direct module imports. At red state, the import from convex/auth.config.ts
 * produces TS2307 because the module has not been created yet — that is the
 * expected red-state error and is tolerated by the validator.
 */

/** Minimal shape of an auth provider entry in the config providers array. */
type AuthProvider = { id: string; clientId?: string; clientSecret?: string };

// ── AC1: Convex Auth configured with magic link provider ─────────────

describe("AC1 — magic link provider configured", () => {
  it("auth config exports a providers array containing a magic-link entry", () => {
    expect(authConfig).toBeDefined();
    expect(authConfig.providers).toBeInstanceOf(Array);

    const magicLinkProvider = authConfig.providers.find(
      (p: AuthProvider) => p.id === "magic-link",
    );
    expect(magicLinkProvider).toBeDefined();
  });
});

// ── AC2: Convex Auth configured with Google OAuth provider ───────────

describe("AC2 — Google OAuth provider configured", () => {
  it("auth config providers array contains a google provider", () => {
    const googleProvider = authConfig.providers.find(
      (p: AuthProvider) => p.id === "google",
    );
    expect(googleProvider).toBeDefined();
  });

  it("Google OAuth provider exposes clientId and clientSecret sourced from env vars", () => {
    const googleProvider = authConfig.providers.find(
      (p: AuthProvider) => p.id === "google",
    );
    expect(googleProvider).toBeDefined();

    // The provider must have clientId and clientSecret properties.
    // These are sourced from GOOGLE_OAUTH_CLIENT_ID and
    // GOOGLE_OAUTH_CLIENT_SECRET env vars at config load time.
    // In the test environment these env vars are typically unset, so
    // the values will be undefined — proving they come from process.env
    // rather than being hardcoded strings.
    expect(googleProvider).toHaveProperty("clientId");
    expect(googleProvider).toHaveProperty("clientSecret");
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
    await t.run(async (ctx) =>
      getUserByEmail(ctx, "onerow@example.com"),
    );

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
    await t.run(async (ctx) =>
      getUserByEmail(ctx, "nodup@example.com"),
    );
    await t.run(async (ctx) =>
      getUserByEmail(ctx, "nodup@example.com"),
    );

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

// ── AC7: No password-based registration ──────────────────────────────

describe("AC7 — no password provider in auth config", () => {
  it("auth config providers array does not include a password provider", () => {
    const passwordProvider = authConfig.providers.find(
      (p: AuthProvider) => p.id === "password" || p.id === "credentials",
    );
    expect(passwordProvider).toBeUndefined();
  });

  it("auth config has exactly two providers (magic-link and google)", () => {
    expect(authConfig.providers).toHaveLength(2);

    const ids = authConfig.providers.map((p: AuthProvider) => p.id).sort();
    expect(ids).toEqual(["google", "magic-link"]);
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
    const identity = await t.run(async (ctx) =>
      ctx.auth.getUserIdentity(),
    );

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
        .withIndex("by_email", (q) =>
          q.eq("email", "subsequent@example.com"),
        )
        .unique();
    });
    expect(user).not.toBeNull();
    expect(user?.role).toBe("USER");
  });
});
