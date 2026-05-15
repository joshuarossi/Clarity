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
| `copy` | `string` | — | Privacy explanation text shown in the banner |

## StatusPill

Renders a small pill indicating case/phase status. Four variants encode
state through both shape and color so that color is never the sole
carrier of meaning.

```tsx
import { StatusPill } from "@/components/ui/StatusPill";

<StatusPill variant="turn" label="Your Turn" />
```

### Variants

| Variant | Dot shape | Color | CSS class |
|---------|-----------|-------|-----------|
| `turn` | Filled circle | Green | `.pill-turn` |
| `waiting` | Hollow circle | Gray | `.pill-waiting` |
| `ready` | Filled circle | Amber | `.pill-ready` |
| `closed` | Square | Neutral | `.pill-closed` |

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"turn" \| "waiting" \| "ready" \| "closed"` | — | Visual variant |
| `label` | `string` | — | Text shown inside the pill |

## PartyAvatar

Renders a 32 × 32 circle with white initials on a role-specific
background color.

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
| `name` | `string` | — | Full name; first letter used as the initial |
| `role` | `"initiator" \| "invitee" \| "coach"` | — | Determines background color |
| `size` | `number` | `32` | Diameter in pixels |

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

## Accessibility

- All icon-only buttons include `aria-label` attributes
- StatusPill encodes state via shape + color (not color alone)
- All components meet WCAG AA contrast (4.5:1 text, 3:1 large text)
- Dark mode uses `[data-theme="dark"]` selectors

## Theming

All components automatically adapt to light/dark theme via CSS custom
properties. No Tailwind `dark:` prefix is used — theme switching is
handled by the `data-theme` attribute on `<html>`.
