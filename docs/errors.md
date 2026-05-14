# Error Handling

Clarity's backend errors are centralized in `convex/lib/errors.ts`. Every
thrown error is a `ConvexError<AppErrorData>` carrying a uniform
`{ code, message, httpStatus }` payload so the frontend can react to
error codes without parsing strings.

## Error codes

| Code             | HTTP Status | Typical trigger                        |
| ---------------- | ----------- | -------------------------------------- |
| `UNAUTHENTICATED`| 401         | No valid session / identity            |
| `FORBIDDEN`      | 403         | User lacks required role or membership |
| `NOT_FOUND`      | 404         | Record does not exist                  |
| `CONFLICT`       | 409         | Invalid state transition or duplicate  |
| `INVALID_INPUT`  | 400         | Validation failure on user input       |
| `TOKEN_INVALID`  | 400         | Expired or malformed token             |
| `RATE_LIMITED`   | 429         | Too many requests                      |
| `AI_ERROR`       | 502         | Upstream AI provider failure           |
| `INTERNAL`       | 500         | Unexpected server error                |

## Usage

### Generic helper

```ts
import { appError } from "../lib/errors";

throw appError("NOT_FOUND", "Case does not exist");
```

`appError` selects the correct HTTP status automatically.

### Named constructors

Each code also has a convenience function that reads more naturally at
call sites:

```ts
import { notFound, forbidden, rateLimited } from "../lib/errors";

throw notFound("Case does not exist");
throw forbidden("Only admins may archive cases");
throw rateLimited("Too many session requests");
```

### Frontend consumption

On the client, catch a `ConvexError` and inspect `error.data`:

```ts
if (error instanceof ConvexError) {
  const { code, message, httpStatus } = error.data;
  // map `code` to a user-facing string
}
```

## Types

- **`ErrorCode`** — string literal union of the nine codes.
- **`AppErrorData`** — `{ code: ErrorCode; message: string; httpStatus: number }`.
- **`HTTP_STATUS`** — lookup map from `ErrorCode` to its numeric HTTP status.
