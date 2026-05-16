# Cases API

The Cases module (`convex/cases.ts`) provides the CRUD layer for mediation
cases. Every function requires authentication via `requireAuth`.

## Queries

### `cases/list`

Returns all cases where the caller is either the initiator or the invitee,
sorted by `updatedAt` descending. Takes no arguments.

### `cases/get`

Returns a single case by ID. Throws `FORBIDDEN` if the caller is not a
party to the case.

| Argument | Type | Description |
|----------|------|-------------|
| `caseId` | `Id<"cases">` | The case to retrieve |

### `cases/partyStates`

Returns both parties' state for a case. The caller's own `partyState` is
returned in full. The other party's state is privacy-filtered to include
only `role` and a `hasCompletedPC` boolean — no form content or private
coaching data is exposed.

| Argument | Type | Description |
|----------|------|-------------|
| `caseId` | `Id<"cases">` | The case to query |
| `viewAsRole` | `"INITIATOR" \| "INVITEE"` (optional) | Solo-mode override: determines which partyState is `self` and which is `other` |

**Solo mode:** In solo cases, both parties share the same `userId`. Pass
`viewAsRole` to select which role's partyState is returned as `self`. When
absent in solo mode, defaults to INITIATOR.

### `cases/listForDashboard`

Returns all cases where the caller is a party (initiator or invitee), enriched
with display-ready fields for the dashboard. Each entry includes the other
party's resolved name (or `null` if the invitee hasn't joined), a
`statusVariant` (`pill-turn`, `pill-waiting`, `pill-ready`, `pill-closed`), a
human-readable `statusLabel`, and a `isSolo` flag. Results are sorted by
`updatedAt` descending. Takes no arguments.

## Mutations

### `cases/create`

Creates a new case. Pins the template version from the category's current
active template. In standard mode, generates an invite token and returns the
case ID plus an invite URL. In solo mode, both parties are the caller, no
invite token is generated, and `inviteUrl` is `null`.

| Argument | Type | Description |
|----------|------|-------------|
| `category` | `string` | Category for the case |
| `mainTopic` | `string` | Main topic of the dispute |
| `description` | `string` | Description of the situation |
| `desiredOutcome` | `string` | Desired outcome |
| `templateId` | `Id<"templates">` (optional) | Explicit template override |
| `isSolo` | `boolean` (optional) | Solo mode — both parties are the caller |

**Solo mode:** When `isSolo` is `true`, both `initiatorUserId` and
`inviteeUserId` are set to the caller, two `partyStates` rows are created,
no invite token is generated, and the initial status is
`BOTH_PRIVATE_COACHING`.

### `cases/updateMyForm`

Updates the caller's intake form fields on their `partyState`.

| Argument | Type | Description |
|----------|------|-------------|
| `caseId` | `Id<"cases">` | The case to update |
| `mainTopic` | `string` | Main topic of the dispute |
| `description` | `string` | Description of the situation |
| `desiredOutcome` | `string` | Desired outcome |

**Side effect:** If the caller's `partyState.formCompletedAt` is not yet set,
it is stamped with the current time on first submission.

## Privacy invariant

One party never sees the other's form content or private coaching data.
The `partyStates` query enforces this by stripping all fields except `role`
and `hasCompletedPC` from the other party's record.
