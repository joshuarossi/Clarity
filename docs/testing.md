# Testing

## E2E tests (Playwright)

End-to-end tests live in `e2e/` and are driven by
[Playwright](https://playwright.dev). The root `playwright.config.ts`
targets three browser engines: Chromium, Firefox, and WebKit.

### Running tests

```bash
# Run all E2E tests
npx playwright test

# Run a single spec
npx playwright test e2e/smoke.spec.ts

# Run in headed mode for debugging
npx playwright test --headed
```

### Fixtures

Import `test` and `expect` from `e2e/fixtures` (not from
`@playwright/test` directly) to use the shared fixtures:

| Fixture              | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| `authenticatedPage`  | A `Page` pre-logged-in as a freshly created test user.              |
| `pageA` / `pageB`    | Two separate authenticated browser contexts for multi-user tests.   |

### Test helpers (`e2e/helpers.ts`)

| Helper            | Purpose                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `createTestUser`  | Creates a test user; accepts optional `email` and `role`.         |
| `createTestCase`  | Creates a test mediation case for a given initiator.              |
| `loginAs`         | Programmatically authenticates a `Page` as the given user.        |

> **Note:** The helpers currently return stubs. They will be wired to
> the Convex dev backend in a follow-up task.

### Claude mock mode

Set the `CLAUDE_MOCK` environment variable to `true` to replace all
Claude API calls with deterministic canned responses. This is intended
for E2E and integration tests so AI features can be exercised without
hitting the Anthropic API.

```bash
CLAUDE_MOCK=true npx playwright test
```

The mock module (`convex/lib/claudeMock.ts`) provides a canned response
for each prompt role: `PRIVATE_COACH`, `COACH`, `DRAFT_COACH`, and
`SYNTHESIS`. Responses are realistic markdown (or JSON for synthesis) and
are always identical for a given role — no randomness.

**`CLAUDE_MOCK_DELAY_MS`** — optional. Controls simulated streaming
latency in milliseconds (default: `100`).

### CI considerations

The Playwright config reads a `CI` environment variable to adjust
timeouts and retries automatically. GitHub Actions workflows should set
`CLAUDE_MOCK=true` and ensure a Convex dev deployment is available.
