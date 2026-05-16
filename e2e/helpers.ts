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

export async function createTestCaseWithInvite(
  options: {
    initiatorEmail: string;
    category?: string;
    mainTopic?: string;
  },
): Promise<{ caseId: string; token: string; initiatorEmail: string }> {
  // TODO: Wire to Convex dev backend when available
  // Creates a case with an ACTIVE invite token for e2e testing
  void options.category;
  void options.mainTopic;
  return {
    caseId: crypto.randomUUID(),
    token: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
    initiatorEmail: options.initiatorEmail,
  };
}

export async function consumeTestInvite(
  token: string,
): Promise<void> {
  // TODO: Wire to Convex dev backend when available
  // Redeems the invite token via the backend API so it transitions to CONSUMED status
  void token;
}
