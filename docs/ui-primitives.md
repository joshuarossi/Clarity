# UI Primitives

Shared components that communicate privacy, status, identity, and
navigation context across case screens. Import them from
`src/components/ui/` (PrivacyBanner, StatusPill, PartyAvatar) or
`src/components/layout/` (PhaseHeader).

## PrivacyBanner

Displays a warm-tinted banner with a lock icon and customizable copy to
indicate that the current view is private.

```tsx
import { PrivacyBanner } from "@/components/ui/PrivacyBanner";

<PrivacyBanner copy="Private to you. Jordan will never see any of it." />
```

- Background: `--private-tint` (#F0E9E0 light / #2D2924 dark)
- CSS class: `.cc-banner-privacy` (defined in `components.css`)
- Clicking the lock icon opens a dialog explaining what is private and why
- The dialog uses Radix Dialog (max-width 480 px, 20 px radius)

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `copy` | `ReactNode` | — | Privacy explanation content shown in the banner |
| `className` | `string` | — | Additional CSS class names |

## StatusPill

Renders a small pill indicating case/phase status. Four variants encode
state through both shape and color so that color is never the sole
carrier of meaning.

```tsx
import { StatusPill } from "@/components/ui/StatusPill";

<StatusPill variant="pill-turn" label="Your Turn" />
```

### Variants

| Variant | Dot shape | Color | CSS class |
|---------|-----------|-------|-----------|
| `pill-turn` | Filled circle | Green | `.cc-status-pill--pill-turn` |
| `pill-waiting` | Hollow circle | Gray | `.cc-status-pill--pill-waiting` |
| `pill-ready` | Filled circle | Amber | `.cc-status-pill--pill-ready` |
| `pill-closed` | Square | Neutral | `.cc-status-pill--pill-closed` |

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"pill-turn" \| "pill-waiting" \| "pill-ready" \| "pill-closed"` | — | Visual variant |
| `label` | `string` | — | Text shown inside the pill |

## PartyAvatar

Renders a circle with white initials on a role-specific background color.
Three sizes: `sm` (24 px), `md` (32 px, default), `lg` (40 px).

```tsx
import { PartyAvatar } from "@/components/ui/PartyAvatar";

<PartyAvatar name="Alex" role="initiator" />
```

### Role colors

| Role | Light | Dark |
|------|-------|------|
| `initiator` | `--party-initiator` (#6B85A8) | #8BA3C2 |
| `invitee` | `--party-invitee` (#B07A8F) | #CC96A9 |
| `coach` | `--coach-accent` (#8B7AB5) | #A797CC |

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | — | Full name; first + last initial extracted for display |
| `role` | `"initiator" \| "invitee" \| "coach"` | — | Determines background color |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Avatar size: sm=24px, md=32px, lg=40px |
| `className` | `string` | — | Additional CSS class names |

## PhaseHeader

Top navigation bar for case phase screens. Fixed height of 56 px with a
back link on the left, case + phase title in the center, and an action
slot on the right.

```tsx
import { PhaseHeader } from "@/components/layout/PhaseHeader";

<PhaseHeader caseName="Smith v. Jones" phaseName="Private Coaching">
  <button>Mark Complete</button>
</PhaseHeader>
```

- Background: `--bg-surface` with a 1 px bottom border
- Back arrow uses the `ArrowLeft` icon from lucide-react (14 px)
- CSS class: `.cc-phase-header` (defined in `components.css`)

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `caseName` | `string` | — | Case display name |
| `phaseName` | `string` | — | Current phase label |
| `backTo` | `string` | `"/dashboard"` | Route for the back link |
| `children` | `ReactNode` | — | Phase-specific actions rendered in the right slot |

## Chat Components

For the chat-specific primitives (ChatWindow, MessageBubble, MessageInput,
StreamingIndicator), see [chat-components.md](chat-components.md).

## Accessibility

- All icon-only buttons include `aria-label` attributes
- StatusPill encodes state via shape + color (not color alone)
- All components meet WCAG AA contrast (4.5:1 text, 3:1 large text)
- Dark mode uses `[data-theme="dark"]` selectors

## Theming

All components automatically adapt to light/dark theme via CSS custom
properties. No Tailwind `dark:` prefix is used — theme switching is
handled by the `data-theme` attribute on `<html>`.
