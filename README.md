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

## Getting started

```bash
npm install
```

### Environment

Copy `.env.example` (if present) or create `.env.local` with:

```
VITE_CONVEX_URL=<your Convex deployment URL>
```

### Development

```bash
npx convex dev   # start Convex backend (watches for schema changes)
npm run dev      # start Vite dev server
```

Open `http://localhost:5173` in your browser.
