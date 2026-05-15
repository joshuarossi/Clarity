# Seed Data

The seed script (`convex/seed.ts`) bootstraps a development database
with the minimum data needed to exercise Clarity's case-creation and
coaching flows.

## What it creates

| Record | Details |
|---|---|
| Admin user | `admin@clarity-dev.local`, role `ADMIN` |
| Workplace template | "Workplace Conflict" with v1 guidance |
| Family template | "Family Conflict" with v1 guidance |
| Personal template | "Personal Conflict" with v1 guidance |

Each template is created with an initial `templateVersion` (version 1)
containing default `globalGuidance` text, and the template's
`currentVersionId` is linked to that version.

## Running the seed

```bash
npx convex run seed:seed
```

## Idempotency

The script checks for existing records before inserting:

- The admin user is looked up by email via the `by_email` index.
- Each template is looked up by category via the `by_category` index.

Running the seed multiple times against the same database produces no
duplicates.

## Production guard

The seed function throws immediately if `IS_PRODUCTION` is set to
`"true"`, preventing accidental execution against a production database.

## Exported constants

`convex/seed.ts` exports two constants for use in tests and dev tooling:

- `ADMIN_EMAIL` — the well-known admin email address
- `DEFAULT_CATEGORIES` — tuple of the three template categories
