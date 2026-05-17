import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

/**
 * WOR-160: Verify convex/http.ts exists and correctly wires Convex Auth
 * HTTP routes. These are structural/static tests — the Convex HTTP router
 * cannot be instantiated in a Vitest environment.
 */

const HTTP_FILE = resolve(__dirname, "../../convex/http.ts");

function readSource(): string {
  return readFileSync(HTTP_FILE, "utf-8");
}

describe("convex/http.ts", () => {
  // AC1: convex/http.ts exists, creates httpRouter, imports auth,
  //      calls auth.addHttpRoutes, and default-exports the router
  describe("AC1: file structure", () => {
    it("exists at convex/http.ts", () => {
      expect(existsSync(HTTP_FILE)).toBe(true);
    });

    it("imports httpRouter from 'convex/server'", () => {
      const source = readSource();
      expect(source).toMatch(/import.*httpRouter.*from\s+['"]convex\/server['"]/);
    });

    it("imports auth from './auth'", () => {
      const source = readSource();
      expect(source).toMatch(/import.*auth.*from\s+['"]\.\/auth/);
    });

    it("calls auth.addHttpRoutes", () => {
      const source = readSource();
      expect(source).toMatch(/auth\.addHttpRoutes\s*\(/);
    });

    it("has a default export", () => {
      const source = readSource();
      expect(source).toMatch(/export\s+default/);
    });
  });

  // AC2: auth.addHttpRoutes is called — prerequisite for HTTP endpoints
  // being reachable after deployment
  describe("AC2: HTTP route registration", () => {
    it("registers auth HTTP routes via addHttpRoutes", () => {
      const source = readSource();
      expect(source).toMatch(/auth\.addHttpRoutes\s*\(/);
    });
  });

  // AC3: auth.addHttpRoutes registers magic-link callback routes
  describe("AC3: magic-link flow support", () => {
    it("calls auth.addHttpRoutes to register magic-link routes", () => {
      const source = readSource();
      expect(source).toMatch(/auth\.addHttpRoutes/);
    });
  });

  // AC4: auth.addHttpRoutes registers OAuth callback routes
  describe("AC4: OAuth flow support", () => {
    it("calls auth.addHttpRoutes to register OAuth routes", () => {
      const source = readSource();
      expect(source).toMatch(/auth\.addHttpRoutes/);
    });
  });

  // AC5: http.ts does not break existing Convex functions
  describe("AC5: no Node.js built-ins or runtime directives", () => {
    it("does not use 'use node' directive", () => {
      const source = readSource();
      expect(source).not.toContain('"use node"');
    });

    it("does not import Node crypto", () => {
      const source = readSource();
      expect(source).not.toMatch(/import.*from\s+['"]crypto['"]/);
    });

    it("does not import Node fs", () => {
      const source = readSource();
      expect(source).not.toMatch(/import.*from\s+['"]fs['"]/);
    });

    it("does not import Node path", () => {
      const source = readSource();
      expect(source).not.toMatch(/import.*from\s+['"]path['"]/);
    });

    it("does not use node: protocol imports", () => {
      const source = readSource();
      expect(source).not.toMatch(/import.*from\s+['"]node:/);
    });
  });
});
