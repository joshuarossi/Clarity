# Case Detail Page

The **CaseDetailPage** (`src/routes/CaseDetailPage.tsx`) is the orchestrator
for the entire case experience. Rather than separate routes per phase, this
single page subscribes to the live case status via Convex and renders the
correct subview in real time.

## Route

```
/cases/:caseId
/cases/:caseId/private
/cases/:caseId/joint
/cases/:caseId/closed
```

The base route renders whichever subview matches the current case status.
Subroutes also work but **redirect** to the correct subroute if the case
status doesn't match (e.g. visiting `/joint` while the case is still in
private coaching redirects to `/private`).

## Status → Subview mapping

| Case Status                                        | Rendered View         |
|----------------------------------------------------|-----------------------|
| `DRAFT_PRIVATE_COACHING` / `BOTH_PRIVATE_COACHING` | PrivateCoachingView   |
| `READY_FOR_JOINT`                                  | ReadyForJointView     |
| `JOINT_ACTIVE`                                     | JointChatView         |
| `CLOSED_RESOLVED` / `CLOSED_UNRESOLVED` / `CLOSED_ABANDONED` | ClosedCaseView |

## Invitee perspective form

When an invitee opens a case in `DRAFT_PRIVATE_COACHING` or
`BOTH_PRIVATE_COACHING` and has not yet submitted their perspective, the page
renders a perspective intake form (matching the case-creation form) instead of
the coaching view.

## Authorization

If the authenticated user is not a party to the case, the page redirects to
`/dashboard` and shows an error toast.

## Reactive updates

The page uses `useQuery(api.cases.get, { caseId })` which provides a live
subscription. When the case transitions status server-side (e.g. coaching
completes), the view updates automatically without polling or page refresh.

## PhaseHeader

The `PhaseHeader` layout component is rendered at the top of the page with a
phase name derived from the current status (e.g. "Private Coaching", "Joint
Discussion", "Closed").

## ClosedCaseView

When the case status is `CLOSED_RESOLVED`, `CLOSED_UNRESOLVED`, or
`CLOSED_ABANDONED`, the orchestrator renders the **ClosedCaseView**
(`src/routes/ClosedCaseView.tsx`).

### Layout

- **Header:** Case name, category, closure date, and outcome badge
  (Resolved / Not Resolved / Abandoned).
- **Closure summary:** Shown only for `CLOSED_RESOLVED` cases; displayed
  prominently below the header.
- **Banner:** "This case is closed. No new messages can be added."
- **Tabbed content:** Three tabs controlled via URL search param (`?tab=`):
  - *Joint Chat* — full read-only transcript (no input bar or send button).
  - *My Private Coaching* — the authenticated user's private coaching
    messages only.
  - *My Guidance* — the user's synthesis document.

### Privacy

The other party's private coaching and synthesis are never rendered or
fetched. Server-side queries scope private data to the authenticated user;
the UI does not expose tabs or links to the other party's data.

### Accessibility

Tab navigation uses ARIA tab roles and is fully keyboard-accessible.
