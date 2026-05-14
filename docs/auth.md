# Authentication & Authorization

Clarity's backend authorization lives in `convex/lib/auth.ts`. Every
Convex function that reads or writes user-scoped data must call one of
the helpers below before proceeding.

## Helpers

### `requireAuth(ctx)`

Returns the authenticated user's `Doc<"users">` record. Throws
`UNAUTHENTICATED` (HTTP 401) if no valid session exists or if the
identity's email has no matching row in the `users` table.

**Typical usage:** first line of any query or mutation that needs the
current user.

### `getUserByEmail(ctx, email)`

Looks up a user by email (via the `by_email` index). If no row exists,
creates one with `role: "USER"` and a `displayName` derived from the
email prefix. Returns the user document.

**Typical usage:** called during the login/sign-up flow to ensure every
authenticated identity has a corresponding `users` row.

### `requirePartyToCase(ctx, caseId, userId)`

Fetches the case document and verifies that `userId` matches either
`initiatorUserId` or `inviteeUserId`. Throws `NOT_FOUND` (404) if the
case does not exist and `FORBIDDEN` (403) if the user is not a party.

**Typical usage:** gate for any read or write scoped to a specific case
(private messages, joint chat, party state).

### `requireAdmin(ctx)`

Calls `requireAuth` internally, then checks that the user's `role` is
`"ADMIN"`. Throws `FORBIDDEN` (403) otherwise.

**Typical usage:** admin-only operations such as template management or
audit-log queries.

## Error codes

| Code              | HTTP Status | When                              |
|-------------------|-------------|-----------------------------------|
| UNAUTHENTICATED   | 401         | No session or unknown email       |
| FORBIDDEN         | 403         | Insufficient role or not a party  |
| NOT_FOUND         | 404         | Case ID does not exist            |

All errors are thrown as `ConvexError` with the `{ code, message,
httpStatus }` shape defined in `convex/lib/errors.ts`.
