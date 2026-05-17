# Chat Components

Shared conversation primitives used by Private Coaching, Joint Chat, and
Draft Coach. Import from `src/components/chat/`.

## ChatWindow

Scrollable message container with ARIA live-region semantics. Receives a
pre-fetched `messages` array as a prop (it does not fetch data itself).

```tsx
import { ChatWindow } from "@/components/chat/ChatWindow";

<ChatWindow messages={messages} />
```

- Wrapping element: `role="log"` + `aria-live="polite"`
- **Sticky auto-scroll**: follows the latest message unless the user has
  scrolled up (50 px threshold). Scroll position is re-evaluated on every
  `messages` change.
- **Enter animation**: each message wrapper applies the `cc-bubble-enter`
  CSS class (150 ms fade-in + 8 px upward translate).

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `messages` | `ChatMessage[]` | — | Array of messages to render |
| `onRetry` | `() => void` | — | Callback passed to the Retry button on messages with `ERROR` status |
| `className` | `string` | — | Additional CSS class names |
| `style` | `React.CSSProperties` | — | Inline style overrides applied to the root `role="log"` element |

## MessageBubble

Renders a single chat message. Seven visual variants map to different
authorship/context roles, and three statuses control what chrome is shown.

```tsx
import { MessageBubble } from "@/components/chat/MessageBubble";

<MessageBubble
  variant="coach-joint"
  status="COMPLETE"
  content="Let's try rephrasing that."
  createdAt={Date.now()}
  onCopy={() => {}}
/>
```

### Variants

| Variant | CSS class | Usage |
|---------|-----------|-------|
| `user` | `.cc-bubble` | User's own messages |
| `coach` | `.cc-bubble-coach` | Coach in private phase |
| `coach-joint` | `.cc-bubble-coach-joint` | Coach in joint chat |
| `coach-intervention` | `.cc-bubble-coach-intervention` | Coach intervention |
| `party-initiator` | `.cc-bubble-party-initiator` | Initiator in joint chat |
| `party-invitee` | `.cc-bubble-party-invitee` | Invitee in joint chat |
| `error` | `.cc-bubble-error` | Error state |

### Statuses

| Status | Behavior |
|--------|----------|
| `STREAMING` | Shows content + blinking streaming cursor; no copy button |
| `COMPLETE` | Shows full content + timestamp (hidden by default, visible on hover via `.cc-timestamp-hidden`) + Copy button |
| `ERROR` | Error styling + optional Retry button (when `onRetry` provided) |

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `BubbleVariant` | — | Visual variant (see table above) |
| `status` | `MessageStatus` | — | `"STREAMING"`, `"COMPLETE"`, or `"ERROR"` |
| `content` | `string` | — | Message text |
| `authorName` | `string` | — | Display name rendered as an avatar/label above the message (`.cc-bubble-avatar`) |
| `createdAt` | `number` | — | Unix timestamp (ms) for the message |
| `onRetry` | `() => void` | — | Callback for Retry button (ERROR status only) |
| `onCopy` | `() => void` | — | Callback fired after copy-to-clipboard |
| `className` | `string` | — | Additional CSS class names |

## MarkdownContent

Lightweight markdown renderer used inside `MessageBubble` to format
Coach/assistant message content. Supports headings (`###`), bold
(`**text**`), italic (`*text*`), unordered lists (`- item`), and ordered
lists (`1. item`). Raw HTML in message content is **not** rendered — all
output is safe React elements, preventing XSS.

```tsx
import { MarkdownContent } from "@/components/chat/MarkdownContent";

<MarkdownContent content="### Welcome\n- Point one\n- **Bold** point" />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | — | Markdown source text to render |
| `className` | `string` | — | Additional CSS class names on the wrapper `<span>` |

### Rendering rules

| Syntax | Output element |
|--------|---------------|
| `### heading` | `<h3>` |
| `- item` | `<ul><li>` |
| `1. item` | `<ol><li>` |
| `**bold**` | `<strong>` |
| `*italic*` | `<em>` |
| Plain line | `<p>` |

User-authored messages (variant `user`) continue to render as plain text;
markdown rendering applies only to Coach/assistant variants.

## MessageInput

Textarea + Send button with Enter-to-send and Shift+Enter for newline.

```tsx
import { MessageInput } from "@/components/chat/MessageInput";

<MessageInput onSend={(text) => sendMessage(text)} isAiResponding={false} />
```

- **Enter** sends the message; **Shift+Enter** inserts a newline.
- The Send button is disabled while `isAiResponding` is true **or** the
  textarea is empty. The textarea itself stays enabled so users can
  pre-type their next message.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSend` | `(text: string) => void` | — | Called with trimmed text on send |
| `isAiResponding` | `boolean` | `false` | Disables the Send button while AI streams |
| `placeholder` | `string` | `"Type a message..."` | Textarea placeholder text |
| `className` | `string` | — | Additional CSS class names |
| `autoFocus` | `boolean` | — | Auto-focus the textarea on mount |
| `defaultValue` | `string` | — | Initial text to populate the textarea (e.g. for "Edit before sending") |

## StreamingIndicator

A minimal blinking cursor displayed inline at the end of streaming
message text. Rendered as a `<span>` with class `cc-streaming-cursor`
(2 px × 1 em bar, `animation: cc-blink 1s steps(2, start) infinite`).
It is `aria-hidden="true"` since it is purely decorative.

```tsx
import { StreamingIndicator } from "@/components/chat/StreamingIndicator";

<StreamingIndicator />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | — | Additional CSS class names |

## ClosureModal

Three-path dialog for ending a joint chat session. Opened via the "Close"
button in the joint chat top nav.

```tsx
import { ClosureModal } from "@/components/chat/ClosureModal";

<ClosureModal
  open={showClosure}
  onOpenChange={setShowClosure}
  onProposeClosure={async (summary) => { /* call proposeClosure */ }}
  onUnilateralClose={async (reason) => { /* call unilateralClose */ }}
  otherPartyName="Jordan"
/>
```

### Paths

| Path | Behaviour |
|------|-----------|
| **Resolved** | Shows a required textarea ("Briefly describe what you agreed to"), then calls `onProposeClosure` with the summary. The other party must confirm via the `ClosureConfirmBanner`. |
| **Not resolved** | Warning-styled view with an optional reason textarea. Calls `onUnilateralClose` to immediately close the case as CLOSED_UNRESOLVED. |
| **Take a break** | Closes the modal and the browser tab. No mutation — the case stays JOINT_ACTIVE. |

### Props

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Controls dialog visibility |
| `onOpenChange` | `(open: boolean) => void` | Called when the dialog wants to open/close |
| `onProposeClosure` | `(summary: string) => Promise<void>` | Resolved path callback |
| `onUnilateralClose` | `(reason?: string) => Promise<void>` | Not-resolved path callback |
| `otherPartyName` | `string` | Name shown in confirmation copy |

### Styling

Max-width 480 px, padding 24 px, border-radius 20 px, 150 ms fade + scale
animation per StyleGuide §6.12. Uses the shadcn/ui `Dialog` primitive.

## ClosureConfirmBanner

Inline banner rendered when the other party has proposed resolution.
Displays the proposer's summary and provides **Confirm** / **Reject and
keep talking** buttons.

```tsx
import { ClosureConfirmBanner } from "@/components/chat/ClosureConfirmBanner";

<ClosureConfirmBanner
  summary="We agreed to split the deposit 50/50."
  proposerName="Jordan"
  onConfirm={handleConfirm}
  onReject={handleReject}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `summary` | `string` | The closure summary written by the proposer |
| `proposerName` | `string` | Display name of the party who proposed |
| `onConfirm` | `() => void` | Fires when the user confirms — should call `confirmClosure` |
| `onReject` | `() => void` | Fires when the user rejects — should call `rejectClosure` |

### Accessibility

- Root element uses `role="status"` + `aria-live="polite"`.
- The Confirm button receives focus automatically when the banner mounts.

## CSS classes

All bubble and animation classes are defined in `src/styles/components.css`:

- `.cc-bubble`, `.cc-bubble-coach`, `.cc-bubble-coach-joint`,
  `.cc-bubble-coach-intervention`, `.cc-bubble-party-initiator`,
  `.cc-bubble-party-invitee`, `.cc-bubble-error` — bubble variants
- `.cc-bubble-enter` — 150 ms fade-in + 8 px translate entry animation
- `.cc-bubble-timestamp` — hover-revealed timestamp
- `.cc-timestamp-hidden` — hides the timestamp by default; visible on hover
- `.cc-bubble-avatar` — author name/glyph label above the message content
- `.cc-streaming-cursor` — blinking cursor bar
- `.cc-message-input` — input container

## Accessibility

- `ChatWindow` uses `role="log"` and `aria-live="polite"` so screen
  readers announce new messages without interrupting the user.
- Copy and Retry buttons include `aria-label` attributes.
- `StreamingIndicator` is `aria-hidden="true"`.
