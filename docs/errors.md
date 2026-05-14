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

### Frontend error handler

`src/lib/errorHandler.ts` provides `handleConvexError(error)` which
accepts any caught error and returns a user-friendly string suitable for
toast display. It maps each `ErrorCode` to a plain-language message:

| Code              | User-facing message                                                |
| ----------------- | ------------------------------------------------------------------ |
| `UNAUTHENTICATED` | "Please sign in to continue."                                      |
| `FORBIDDEN`       | "You don't have permission to do that."                            |
| `NOT_FOUND`       | "We couldn't find what you're looking for."                        |
| `CONFLICT`        | "This action can't be performed right now. The state may have changed." |
| `INVALID_INPUT`   | "Please check your input and try again."                           |
| `TOKEN_INVALID`   | "This invite link is no longer valid."                             |
| `RATE_LIMITED`    | "Too many requests. Please wait a moment and try again."           |
| `AI_ERROR`        | "The AI service encountered an issue. Please try again."           |
| `INTERNAL`        | "Something went wrong on our end. Please try again."               |

Unrecognised errors fall back to a generic "Something went wrong" message.

```ts
import { handleConvexError } from "../lib/errorHandler";

try {
  await doSomething();
} catch (error) {
  showToast(handleConvexError(error));
}
```

## Types

- **`ErrorCode`** — string literal union of the nine codes.
- **`AppErrorData`** — `{ code: ErrorCode; message: string; httpStatus: number }`.
- **`HTTP_STATUS`** — lookup map from `ErrorCode` to its numeric HTTP status.
