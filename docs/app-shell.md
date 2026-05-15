# App Shell & Routing

The Clarity frontend is a single-page React 18 application served by
Vite and connected to the Convex backend via reactive providers.

## Provider Stack

Providers are nested in `src/main.tsx` in this order:

```
<ConvexProvider>          — reactive backend connection (VITE_CONVEX_URL)
  <ConvexAuthProvider>    — session / identity management
    <BrowserRouter>       — client-side routing
      <App />
    </BrowserRouter>
  </ConvexAuthProvider>
</ConvexProvider>
```

## Route Tree

Defined in `src/App.tsx`:

| Path                          | Guard       | Description               |
| ----------------------------- | ----------- | ------------------------- |
| `/`                           | public      | Landing / home page       |
| `/login`                      | public      | Login (redirects to dashboard if already signed in) |
| `/invite/:token`              | public      | Party invite acceptance   |
| `/dashboard`                  | auth        | User dashboard            |
| `/cases/new`                  | auth        | Create a new case         |
| `/cases/:caseId`              | auth        | Case detail               |
| `/cases/:caseId/private`      | auth        | Private coaching session  |
| `/cases/:caseId/joint`        | auth        | Joint session             |
| `/cases/:caseId/closed`       | auth        | Closed case view          |
| `/admin/templates`            | admin       | Prompt template list      |
| `/admin/templates/:id`        | admin       | Prompt template editor    |
| `/admin/audit`                | admin       | Audit log                 |
| `*`                           | —           | 404 fallback              |

### Route Guards

- **`ProtectedRoute`** (`src/components/layout/ProtectedRoute.tsx`) —
  checks `useConvexAuth()`. Shows a loading spinner while the session
  initializes; redirects to `/login` if unauthenticated.
- **`AdminRoute`** (`src/components/layout/AdminRoute.tsx`) — extends
  `ProtectedRoute` by additionally querying the current user's role.
  Non-admin users are redirected to `/dashboard`.

## TopNav

`src/components/layout/TopNav.tsx` renders two variants:

- **`logged-in`** — Dashboard link and user menu.
- **`case-detail`** — Back arrow, case phase display (Private Coaching /
  Joint Session / Closed).

The variant is selected automatically in `AppLayout` based on the
current route path.

## Frontend Error Handler

`src/lib/errorHandler.ts` exports `handleConvexError(error)` which maps
all nine Convex `ErrorCode` values to user-friendly messages suitable for
toast display. Unknown or non-Convex errors fall back to a generic
message. See [Error Handling](errors.md) for the backend error codes.

## Environment Variables

| Variable          | Required | Description                          |
| ----------------- | -------- | ------------------------------------ |
| `VITE_CONVEX_URL` | yes      | Convex deployment URL used by the provider |
