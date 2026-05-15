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

### CI pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs four
sequential jobs on every push and pull request to `main`:

1. **lint** — ESLint + Prettier check
2. **typecheck** — `tsc --noEmit`
3. **unit** — `vitest run`
4. **e2e** — Playwright with `CLAUDE_MOCK=true`, Convex dev deployment,
   and seeded test data

Jobs are chained via `needs:` so fast-failing checks (lint, typecheck)
gate the slower ones. All jobs use Node.js LTS (`lts/*`) with npm
caching.

The E2E job requires a `CONVEX_DEPLOY_KEY` GitHub Actions secret to
provision an ephemeral Convex deployment and seed data. On failure, the
Playwright HTML report and trace files are uploaded as workflow artifacts
(retained for 14 days).

The Playwright config reads a `CI` environment variable to adjust
timeouts and retries automatically.
