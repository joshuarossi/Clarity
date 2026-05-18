import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import * as authExports from "../../convex/auth";

/**
 * WOR-166: Test-only ConvexCredentials provider in convex/auth.ts
 *
 * AC: A test-only ConvexCredentials provider is added to convex/auth.ts,
 * gated behind an environment variable (e.g. ENABLE_TEST_AUTH), so e2e
 * tests can sign in programmatically without magic-link or Google OAuth.
 *
 * These tests verify the source code of convex/auth.ts contains the
 * required conditional Credentials provider pattern. At red state,
 * the source has not been modified yet, so assertions about the
 * Credentials provider will fail — that is the correct red state.
 */

const authSource = fs.readFileSync(
  path.resolve(__dirname, "../../convex/auth.ts"),
  "utf-8",
);

describe("WOR-166: ConvexCredentials provider gated by ENABLE_TEST_AUTH", () => {
  it("imports ConvexCredentials from @convex-dev/auth/providers/ConvexCredentials", () => {
    expect(authSource).toContain(
      "@convex-dev/auth/providers/ConvexCredentials",
    );
  });

  it("gates the Credentials provider behind ENABLE_TEST_AUTH === 'true'", () => {
    expect(authSource).toContain("ENABLE_TEST_AUTH");
    const hasStringComparison =
      authSource.includes('=== "true"') || authSource.includes("=== 'true'");
    expect(hasStringComparison).toBe(true);
  });

  it("registers the provider with id 'test-credentials'", () => {
    expect(authSource).toContain("test-credentials");
  });

  it("includes a Credentials provider call in the providers array", () => {
    expect(authSource).toContain("Credentials(");
  });

  it("still exports auth, signIn, signOut, and store after modification", () => {
    expect(authExports.auth).toBeDefined();
    expect(authExports.signIn).toBeDefined();
    expect(authExports.signOut).toBeDefined();
    expect(authExports.store).toBeDefined();
  });
});
