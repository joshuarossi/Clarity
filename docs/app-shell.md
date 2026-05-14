# App Shell & Routing

The frontend application shell lives in `src/` and provides the entry
point, provider wiring, route definitions, navigation chrome, and route
guards.

## Entry point

`src/main.tsx` renders the React 18 root with providers nested in the
following order:

```
<ConvexProvider>        — reactive backend connection (VITE_CONVEX_URL)
  <ConvexAuthProvider>  — session / identity
    <BrowserRouter>     — client-side routing
      <App />
    </BrowserRouter>
  </ConvexAuthProvider>
</ConvexProvider>
```

## Route tree

Defined in `src/App.tsx`. All routes from TechSpec §9.2:

| Path                        | Component            | Guard       |
| --------------------------- | -------------------- | ----------- |
| `/`                         | LandingPage          | public      |
| `/login`                    | LoginPage            | public      |
| `/invite/:token`            | InviteAcceptPage     | public      |
| `/dashboard`                | Dashboard            | auth        |
| `/cases/new`                | NewCasePage          | auth        |
| `/cases/:caseId`            | CaseDetail           | auth        |
| `/cases/:caseId/private`    | PrivateCoachingView  | auth        |
| `/cases/:caseId/joint`      | JointChatView        | auth        |
| `/cases/:caseId/closed`     | ClosedCaseView       | auth        |
| `/admin/templates`          | TemplatesListPage    | admin       |
| `/admin/templates/:id`      | TemplateEditPage     | admin       |
| `/admin/audit`              | AuditLogPage         | admin       |

A catch-all `*` route renders a 404 page.

## Route guards

- **ProtectedRoute** (`src/components/auth/ProtectedRoute.tsx`) — checks
  `useConvexAuth()`. Shows a spinner while loading; redirects to `/login`
  if unauthenticated.
- **AdminRoute** (`src/components/auth/AdminRoute.tsx`) — extends
  ProtectedRoute by also checking the current user's role. Non-admin
  users are redirected to `/dashboard`.

## TopNav

`src/components/layout/TopNav.tsx` renders contextual variants:

- **Logged-out** — minimal branding, no navigation links.
- **Logged-in** — Dashboard link and user menu.
- **Case-detail** — back arrow (ArrowLeft 14px) and phase display.

## Accessibility

On every route change a `FocusOnNavigate` helper moves focus to the
page's `<h1>`, ensuring screen-reader users are oriented after
navigation. Correct landmark elements (`<nav>`, `<main>`) and
`:focus-visible` rings are used throughout.

## Environment

| Variable          | Purpose                                   |
| ----------------- | ----------------------------------------- |
| `VITE_CONVEX_URL` | Convex deployment URL, used by the client |
