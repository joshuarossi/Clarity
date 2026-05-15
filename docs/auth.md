# Authentication & Authorization

## Sign-in providers (Convex Auth)

Clarity uses [Convex Auth](https://labs.convex.dev/auth) for
authentication. Two providers are configured in `convex/auth.config.ts`:

| Provider     | How it works                                       | Config env vars                                              |
|--------------|----------------------------------------------------|--------------------------------------------------------------|
| Magic link   | Sends a one-time sign-in link via Resend email     | `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (optional, has default)  |
| Google OAuth | Standard OAuth 2.0 redirect flow                   | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`      |

Password-based registration is intentionally excluded.

The `convexAuth()` helper in `convex/auth.ts` registers these providers
and wires a `createOrUpdateUser` callback that delegates to
`getUserByEmail` (see below) — ensuring every authenticated identity has
a `users` row on first login with `role: "USER"`.

Sessions are managed entirely by Convex Auth internals and persist
across browser reloads until explicit logout or 30-day expiry.

## Authorization helpers

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
