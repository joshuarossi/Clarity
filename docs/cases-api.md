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

## Mutations

### `cases/create`

Creates a new case. Pins the template version from the category's current
active template. Generates an invite token and returns the case ID plus an
invite URL.

| Argument | Type | Description |
|----------|------|-------------|
| `categoryId` | `Id<"categories">` | Category for the case |
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
| `mainTopic` | `string` (optional) | Main topic of the dispute |
| `description` | `string` (optional) | Description of the situation |
| `desiredOutcome` | `string` (optional) | Desired outcome |

## Privacy invariant

One party never sees the other's form content or private coaching data.
The `partyStates` query enforces this by stripping all fields except `role`
and `hasCompletedPC` from the other party's record.
