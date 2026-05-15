import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createTestUser, loginAs } from "./helpers";

export type AuthenticatedFixtures = { authenticatedPage: Page };
export type TwoUserFixtures = { pageA: Page; pageB: Page };

export const test = base.extend<AuthenticatedFixtures & TwoUserFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    const { email } = await createTestUser();
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, email);
    await use(page);
    await context.close();
  },
  pageA: async ({ browser }, use) => {
    const { email } = await createTestUser({ email: "testusera@example.com" });
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, email);
    await use(page);
    await context.close();
  },
  pageB: async ({ browser }, use) => {
    const { email } = await createTestUser({ email: "testuserb@example.com" });
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, email);
    await use(page);
    await context.close();
  },
});

export { expect };
