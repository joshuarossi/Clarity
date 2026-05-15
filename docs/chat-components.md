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
| `className` | `string` | — | Additional CSS class names |

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
| `COMPLETE` | Shows full content + timestamp (on hover) + Copy button |
| `ERROR` | Error styling + optional Retry button (when `onRetry` provided) |

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `BubbleVariant` | — | Visual variant (see table above) |
| `status` | `MessageStatus` | — | `"STREAMING"`, `"COMPLETE"`, or `"ERROR"` |
| `content` | `string` | — | Message text |
| `authorName` | `string` | — | Display name of the message author |
| `createdAt` | `number` | — | Unix timestamp (ms) for the message |
| `onRetry` | `() => void` | — | Callback for Retry button (ERROR status only) |
| `onCopy` | `() => void` | — | Callback fired after copy-to-clipboard |
| `className` | `string` | — | Additional CSS class names |

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

## CSS classes

All bubble and animation classes are defined in `src/styles/components.css`:

- `.cc-bubble`, `.cc-bubble-coach`, `.cc-bubble-coach-joint`,
  `.cc-bubble-coach-intervention`, `.cc-bubble-party-initiator`,
  `.cc-bubble-party-invitee`, `.cc-bubble-error` — bubble variants
- `.cc-bubble-enter` — 150 ms fade-in + 8 px translate entry animation
- `.cc-bubble-timestamp` — hover-revealed timestamp
- `.cc-streaming-cursor` — blinking cursor bar
- `.cc-message-input` — input container

## Accessibility

- `ChatWindow` uses `role="log"` and `aria-live="polite"` so screen
  readers announce new messages without interrupting the user.
- Copy and Retry buttons include `aria-label` attributes.
- `StreamingIndicator` is `aria-hidden="true"`.
