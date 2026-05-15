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

## Getting Started

```bash
npm install
```

Create a `.env.local` with:

```
VITE_CONVEX_URL=<your Convex deployment URL>
```

Then start the dev server:

```bash
npx convex dev   # backend
npm run dev       # frontend (Vite)
```

### Seed data

To populate the local database with an admin user and default templates:

```bash
npx convex run seed:seed
```

The seed is idempotent — running it multiple times is safe. It will not
run in production environments.
