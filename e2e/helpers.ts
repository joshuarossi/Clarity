import type { Page } from "@playwright/test";

export async function createTestUser(
  options?: { email?: string; role?: "USER" | "ADMIN" },
): Promise<{ userId: string; email: string }> {
  const email = options?.email ?? `test-${Date.now()}@example.com`;
  // TODO: Wire to Convex dev backend when available
  return { userId: crypto.randomUUID(), email };
}

export async function createTestCase(
  _options: {
    initiatorEmail: string;
    inviteeEmail?: string;
    category?: string;
    isSolo?: boolean;
  },
): Promise<{ caseId: string }> {
  // TODO: Wire to Convex dev backend when available
  return { caseId: crypto.randomUUID() };
}

export async function loginAs(_page: Page, _email: string): Promise<void> {
  // TODO: Implement programmatic auth bypass via Convex test API
  // For now, set a mock auth cookie/token so the fixture structure works
}
