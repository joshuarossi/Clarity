## WOR-97 — Auth identity helper and authorization utilities

Added `convex/lib/auth.ts` with four shared authorization helpers —
`requireAuth`, `getUserByEmail`, `requirePartyToCase`, and `requireAdmin` —
that every Convex query, mutation, and action imports to enforce
authentication and access control. First-time users are automatically
upserted with a `USER` role, and cross-party data isolation is enforced
by verifying case membership before any private data is returned.
