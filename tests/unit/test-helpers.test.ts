import { describe, it, expect } from "vitest";
import { createTestUser, createTestCase, loginAs } from "../../e2e/helpers";

/**
 * WOR-107: Test utility function signature tests
 *
 * AC 7 — Test utility functions for common operations: createTestUser,
 *         createTestCase, loginAs.
 *
 * These tests verify the helpers are exported with the correct types.
 * Full integration validation (actually calling Convex) happens when
 * these helpers are used in E2E tests.
 *
 * At red state: e2e/helpers.ts does not exist yet, so the import
 * produces TS2307. That is the expected red-state error.
 */

describe("WOR-107: e2e/helpers — test utility exports", () => {
  describe("createTestUser", () => {
    it("is exported as a function", () => {
      expect(typeof createTestUser).toBe("function");
    });
  });

  describe("createTestCase", () => {
    it("is exported as a function", () => {
      expect(typeof createTestCase).toBe("function");
    });
  });

  describe("loginAs", () => {
    it("is exported as a function", () => {
      expect(typeof loginAs).toBe("function");
    });
  });
});
