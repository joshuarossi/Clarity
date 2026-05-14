## WOR-98 — ConvexError wrapper and error codes

Added `convex/lib/errors.ts`, a centralized error module that every
Convex function uses to throw structured errors. Nine error codes
(`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`INVALID_INPUT`, `TOKEN_INVALID`, `RATE_LIMITED`, `AI_ERROR`, `INTERNAL`)
are each paired with the correct HTTP status and exposed as named
constructors plus a generic `appError(code, message)` helper. The
frontend can now map `data.code` to user-friendly messages without
parsing raw strings.
