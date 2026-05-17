# Invites API

The Invites module (`convex/invites.ts`) handles the invite-link lifecycle
for standard (two-party) mediation cases. It exposes helper functions for
token generation and URL building, plus a mutation for redeeming tokens.

## Helper functions

### `generateToken()`

Returns a 32-character crypto-random string drawn from the URL-safe
alphabet `A-Z a-z 0-9 - _`. Used internally by `cases/create` to mint a
fresh invite token when a standard case is created.

### `buildInviteUrl(token)`

Returns the full invite URL: `{SITE_URL}/invite/{token}`. Falls back to
`http://localhost:5173` when `SITE_URL` is not set.

## Queries

### `invites/getByToken`

Returns invite preview data for a given token string. **No authentication
required** — logged-out users need the initiator's name for the invite page
heading.

| Argument | Type     | Description              |
| -------- | -------- | ------------------------ |
| `token`  | `string` | The 32-char invite token |

**Returns:** one of three shapes depending on state:

- `{ status: "ACTIVE", initiatorName, mainTopic, category, caseId }` — the
  token is valid and unredeemed. Only exposes the initiator's display name,
  main topic, and category (never description or desired outcome).
- `{ status: "CONSUMED" }` — the token has already been used.
- `null` — the token does not exist or has been revoked.

This query powers the `InviteAcceptPage` component, providing all data needed
for both the logged-out and logged-in views without leaking private fields.

### `invites/getForCase`

Returns the active invite token and its full URL for a given case. Only the
case initiator is allowed to call this query; all other callers receive a
`FORBIDDEN` error.

| Argument | Type          | Description         |
| -------- | ------------- | ------------------- |
| `caseId` | `Id<"cases">` | The case to look up |

**Returns:** `{ token: string, url: string }` if an active invite token
exists for the case, or `null` if no active token is found (e.g. the token
has already been consumed or the case does not exist).

**Error codes:**

| Code              | When                                 |
| ----------------- | ------------------------------------ |
| `FORBIDDEN`       | The caller is not the case initiator |
| `UNAUTHENTICATED` | No authenticated user session        |

This query is used by the Invite Sharing page (`/cases/:caseId/invite`) to
display the invite link and power the copy/share actions.

## Mutations

### `invites/redeem`

Redeems an invite token, joining the caller to the case as the invitee.
The entire operation is atomic — if any step fails, no state changes
persist.

| Argument | Type     | Description              |
| -------- | -------- | ------------------------ |
| `token`  | `string` | The 32-char invite token |

**Steps performed in a single Convex transaction:**

1. Look up the token via the `by_token` index.
2. Validate the token status is `ACTIVE`.
3. Load the case and verify the caller is not the initiator.
4. Set `cases.inviteeUserId` to the caller.
5. Create a `partyStates` row with `role: "INVITEE"`.
6. Mark the token as `CONSUMED`, recording `consumedAt` and
   `consumedByUserId`.

**Returns:** `{ caseId }` — the ID of the case the caller joined.

**Note:** Redeeming an invite does _not_ change the case status. The
transition from `DRAFT_PRIVATE_COACHING` to `BOTH_PRIVATE_COACHING`
happens later when the invitee completes their intake form.

### `invites/decline`

Declines an invite: transitions the case to `CLOSED_ABANDONED` and marks the
token `CONSUMED`. Auth required.

| Argument | Type     | Description              |
| -------- | -------- | ------------------------ |
| `token`  | `string` | The 32-char invite token |

**Steps performed in a single Convex transaction:**

1. Look up the token via the `by_token` index.
2. Validate the token status is `ACTIVE`.
3. Load the case and verify the caller is not the initiator.
4. Validate the state-machine transition (`DECLINE_INVITE`).
5. Patch the case to `CLOSED_ABANDONED` with `closedAt` timestamp.
6. Mark the token as `CONSUMED`.

**Returns:** `null`

## Error codes

| Code              | When                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `TOKEN_INVALID`   | Token does not exist, or has already been consumed or revoked         |
| `CONFLICT`        | The caller is the initiator of the case (self-redeem or self-decline) |
| `UNAUTHENTICATED` | No authenticated user session                                         |

## Invite URL format

```
https://example.com/invite/<32-char-token>
```

The token is embedded directly in the URL path. The frontend route
`/invite/:token` renders the `InviteAcceptPage` component which:

1. Calls `invites/getByToken` to load preview data (no auth required).
2. Shows a logged-out card (sign-in CTA) or a logged-in view with
   Accept/Decline buttons.
3. On accept, calls `invites/redeem` and navigates to the invitee's
   intake form.
4. On decline, calls `invites/decline` and navigates to the dashboard.
5. For consumed tokens, displays an error with login/dashboard options.
