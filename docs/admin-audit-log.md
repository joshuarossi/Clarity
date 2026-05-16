# Admin Audit Log

The audit log page gives administrators a read-only view of every
administrative action taken on the platform.

## Access

Navigate to `/admin/audit`. The route is restricted to admin users —
non-admins are redirected away. Server-side queries enforce the same
gate via `requireAdmin`.

## Table columns

| Column    | Description                                      |
| --------- | ------------------------------------------------ |
| Actor     | Display name or email of the admin who acted     |
| Action    | Action code (e.g. `TEMPLATE_PUBLISHED`)          |
| Target    | `targetType:targetId` of the affected resource   |
| Timestamp | When the action occurred (`createdAt`)            |

## Filtering

Three filters are available above the table:

- **Actor** — free-text input to filter by actor user ID.
- **Action type** — select from known action codes.
- **Date range** — start and end date inputs to constrain results.

Filters are combined with AND logic and applied server-side before pagination.

## Detail drawer

Click any row to open a right-side drawer (Sheet) displaying the full
`metadata` field of the audit log entry as pretty-printed JSON in a
monospace `<pre>` block.

## Pagination

Results are paginated using Convex cursor-based pagination. Navigation
controls appear below the table when additional pages exist.

## Data model

Audit log entries are stored in the `auditLog` Convex table:

| Field          | Type      | Description                        |
| -------------- | --------- | ---------------------------------- |
| `actorUserId`  | `Id<"users">` | The admin who performed the action |
| `action`       | `string`  | Action code                        |
| `targetType`   | `string`  | Type of the affected entity        |
| `targetId`     | `string`  | ID of the affected entity          |
| `metadata`     | `any`     | Arbitrary JSON payload             |
| `createdAt`    | `number`  | Epoch ms timestamp                 |

Indexes supporting efficient filtered queries:
- `by_actor` on `["actorUserId"]`
- `by_action` on `["action"]`
- `by_createdAt` on `["createdAt"]`
