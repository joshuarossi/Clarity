# Privacy Response Filter

> Module: `convex/lib/privacyFilter.ts` · Ticket: WOR-100

## Purpose

Clarity's privacy model allows the Coach AI to read both parties'
private content for context, but strictly forbids surfacing the other
party's raw words in any output. The **privacy response filter** is the
server-side enforcement layer that programmatically detects near-verbatim
leaks before AI-generated text reaches a user.

## API

### `filterResponse(candidateText, otherPartyMessages): FilterResult`

| Parameter            | Type       | Description                              |
| -------------------- | ---------- | ---------------------------------------- |
| `candidateText`      | `string`   | The AI-generated text to check.          |
| `otherPartyMessages` | `string[]` | Private messages from the _other_ party. |

Returns:

```ts
interface FilterResult {
  passed: boolean;
  matchedSubstring?: string;
}
```

- `passed: true` — no verbatim leak detected; safe to deliver.
- `passed: false` — a leak was found; `matchedSubstring` contains the
  matching token sequence. The caller must retry or fall back.

### `tokenize(text): string[]`

Splits text into lowercase tokens on whitespace and punctuation
boundaries. Exported for direct testing.

## How matching works

1. Both the candidate text and each private message are tokenized.
2. For every contiguous window of **8 tokens** in a private message, the
   filter checks whether the same 8-token sequence appears anywhere in
   the candidate.
3. Matching is **case-insensitive** (all tokens are lowercased).
4. If any 8-token window matches, the filter returns `passed: false`
   immediately.

The threshold of 8 consecutive tokens was chosen to balance precision
(short sequences produce too many false positives) against recall
(longer sequences miss partial quotations). Paraphrased content with
different word choices will pass; verbatim or near-verbatim excerpts
will not.

## Caller contract

The filter is a **pure function** — it has no database access and no
Convex runtime dependencies. Callers are responsible for:

- Passing the correct set of other-party messages.
- Handling failures: up to 2 retries with a re-generated response, then
  a generic fallback message plus a flag for admin review (per TechSpec
  §6.5).

## Edge cases

| Scenario                         | Result                            |
| -------------------------------- | --------------------------------- |
| Empty `otherPartyMessages` array | Always passes                     |
| Message shorter than 8 tokens    | Skipped (cannot match)            |
| Empty `candidateText`            | Always passes                     |
| ALL-CAPS copy of original        | Fails (case-insensitive)          |
| One word substituted mid-run     | Passes (breaks consecutive match) |
