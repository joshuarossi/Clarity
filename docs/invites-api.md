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

## Mutations

### `invites/redeem`

Redeems an invite token, joining the caller to the case as the invitee.
The entire operation is atomic — if any step fails, no state changes
persist.

| Argument | Type     | Description                |
|----------|----------|----------------------------|
| `token`  | `string` | The 32-char invite token   |

**Steps performed in a single Convex transaction:**

1. Look up the token via the `by_token` index.
2. Validate the token status is `ACTIVE`.
3. Load the case and verify the caller is not the initiator.
4. Set `cases.inviteeUserId` to the caller.
5. Create a `partyStates` row with `role: "INVITEE"`.
6. Mark the token as `CONSUMED`, recording `consumedAt` and
   `consumedByUserId`.

**Returns:** `{ caseId }` — the ID of the case the caller joined.

**Note:** Redeeming an invite does *not* change the case status. The
transition from `DRAFT_PRIVATE_COACHING` to `BOTH_PRIVATE_COACHING`
happens later when the invitee completes their intake form.

## Error codes

| Code | When |
|------|------|
| `TOKEN_INVALID` | Token does not exist, or has already been consumed or revoked |
| `CONFLICT` | The caller is the initiator of the case (self-redeem) |
| `UNAUTHENTICATED` | No authenticated user session |

## Invite URL format

```
https://example.com/invite/<32-char-token>
```

The token is embedded directly in the URL path. The frontend route
`/invite/:token` is expected to call `invites/redeem` on load.
