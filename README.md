# Clarity

Web-based AI mediation tool. Two parties, structured private coaching,
synthesized joint session, never-auto-sent drafts.

This repository is the autonomous-build target for the Clarity v1 spec
tracked in the WOR Jira project. Code is generated and merged by the
Archon/Archie pipeline against the Epic at WOR-90 and its child tickets.

Spec attachments live on the Epic:

- PRD (Epic description)
- 02-TechSpec.md
- 03-DesignDoc.md
- STYLE_GUIDE.md
- style-guide.html

## Tech stack

- **Backend:** [Convex](https://convex.dev) — real-time serverless database & functions
- **Schema:** `convex/schema.ts` — single source of truth for the data model (see [docs/data-model.md](docs/data-model.md))

## Getting started

```bash
npm install
npx convex dev          # start the Convex dev server and generate types
```

## Running tests

```bash
npm test                # unit tests (vitest)
npm run typecheck       # type-check with tsc
npm run test:e2e        # end-to-end tests (playwright)
```
