# Design Tokens

Clarity's visual layer is built on CSS custom properties ("design tokens")
declared in `src/styles/globals.css`. All component code should reference
these tokens instead of hard-coded color, spacing, or typography values.

## File layout

| File | Purpose |
|---|---|
| `src/styles/globals.css` | All CSS custom property tokens and base styles |
| `src/styles/components.css` | Reusable class recipes (chat bubbles, buttons, banners) |
| `src/styles/theme.ts` | TypeScript mirror of token values for JS-driven visuals |
| `src/components/ui/button.tsx` | shadcn/ui Button with Clarity variant overrides |

## Color palettes

Tokens are declared under `:root` (light, default) and
`[data-theme="dark"]`.

- **Neutrals** — `--bg-canvas`, `--bg-surface`, `--bg-surface-subtle`,
  `--text-primary`, `--text-secondary`, `--text-tertiary`,
  `--border-default`, `--border-strong`
- **Accent (Sage)** — `--accent`, `--accent-hover`, `--accent-subtle`,
  `--accent-on`
- **Coach (Lavender)** — `--coach-accent`, `--coach-subtle`
- **Party** — `--party-initiator`, `--party-initiator-subtle`,
  `--party-invitee`, `--party-invitee-subtle`
- **Feedback** — `--danger`, `--warning`, `--success` (aliased to accent)
- **Tints** — `--private-tint`

## Typography

Fonts loaded from Google Fonts:

- **Inter** (400 / 500 / 600) — `--font-sans`
- **JetBrains Mono** (400 / 500) — `--font-mono`

Scale variables follow the pattern `--font-size-{role}` and
`--line-height-{role}` for roles: `display`, `h1`, `h2`, `h3`, `body`,
`chat`, `label`, `meta`, `timestamp`.

## Spacing, radius, shadow, motion

- Radius: `--radius-sm` (6 px) through `--radius-full` (9999 px)
- Shadows: `--shadow-0` through `--shadow-3`
- Motion ease: `--ease-out` — `cubic-bezier(0.2, 0.7, 0.3, 1)`
- Durations: `--dur-fast` (150 ms), `--dur-medium` (200 ms),
  `--dur-slow` (300 ms)

A global `@media (prefers-reduced-motion: reduce)` reset in `globals.css`
disables all animations and transitions when the user prefers reduced
motion. New animations do **not** need individual `no-preference` wrappers —
the global reset handles them automatically.

## Dark mode

An inline `<script>` in `index.html` reads `localStorage.theme` (falling
back to `prefers-color-scheme`) and sets `data-theme` on `<html>` before
the first paint, preventing a flash of the wrong theme.

To toggle the theme programmatically, set `localStorage.theme` to
`"light"` or `"dark"` and update `document.documentElement.dataset.theme`.

## Chat bubble classes

Defined in `components.css`:

| Class | Use |
|---|---|
| `.cc-bubble` | Base bubble (user message) |
| `.cc-bubble-coach` | AI coach message |
| `.cc-bubble-coach-joint` | Coach message in joint session |
| `.cc-bubble-coach-intervention` | Coach intervention prompt |
| `.cc-bubble-party-initiator` | Initiator party message |
| `.cc-bubble-party-invitee` | Invitee party message |
| `.cc-bubble-error` | Error/system message |

All bubbles share: `padding: 12px 16px`, `border-radius: var(--radius-lg)`,
`max-width: min(640px, 80%)`, and a 150 ms fade-in enter animation.

## Privacy banner and status classes

Defined in `components.css`:

| Class | Use |
|---|---|
| `.cc-banner-privacy` | Privacy banner with `--private-tint` background and lock icon |
| `.cc-status-pill--pill-turn` | StatusPill — active turn (green filled circle) |
| `.cc-status-pill--pill-waiting` | StatusPill — waiting (gray hollow circle) |
| `.cc-status-pill--pill-ready` | StatusPill — ready (amber filled circle) |
| `.cc-status-pill--pill-closed` | StatusPill — closed (neutral square) |
| `.cc-phase-header` | PhaseHeader top bar (56 px, `--bg-surface` background) |

See [UI Primitives](ui-primitives.md) for component usage and props.

## Button variants

The shadcn/ui `<Button>` (`src/components/ui/button.tsx`) is extended with
Clarity-specific variants:

- **primary** — sage fill (`--accent`)
- **secondary** — outlined
- **ghost** — transparent background
- **danger** — terracotta fill (`--danger`)
- **link** — underlined text style

Sizes: `sm` (32 px), `md` (40 px, default), `lg` (48 px), `icon` (36 × 36 px).
