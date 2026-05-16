# Synthesis API

> Module: `convex/synthesis.ts` · Ticket: WOR-122

## Overview

Synthesis is the privacy-critical step that bridges private coaching into
the joint mediation phase. Once both parties have completed private
coaching, the synthesis action reads each party's private messages and
form fields (mainTopic, description, desiredOutcome), calls Claude Sonnet
to produce independent guidance texts for each party, validates the output,
runs a privacy filter, and persists the results atomically.

**Key guarantee:** Neither party ever sees the other's raw words. The
synthesis action is the only server-side code that reads both parties'
private content, and the privacy filter enforces that no cross-party
verbatim content leaks into the output.

## Action: `synthesis.generate`

An internal Convex action triggered when both parties' private coaching
is complete.

### Context assembly

The prompt includes:

- Both parties' private messages (read server-side only)
- Both parties' form fields (`mainTopic`, `description`, `desiredOutcome`)
- The anti-quotation system instruction (TechSpec §6.3.2):
  > "You have access to both parties' private content for context. In your
  > outputs, NEVER quote, closely paraphrase, or otherwise surface the
  > other party's raw words. Synthesize themes and positions in your own
  > words only. If you cannot make a point without quoting, omit it."

### Output format

The model must return strict JSON:

```json
{
  "forInitiator": "string — guidance for the initiator",
  "forInvitee": "string — guidance for the invitee"
}
```

Malformed output (invalid JSON, missing keys, extra keys) is rejected and
triggers a retry.

### Privacy filter

After generation, each synthesis text is checked against the **other**
party's private messages using a token-overlap algorithm:

- `forInitiator` is checked against the invitee's messages.
- `forInvitee` is checked against the initiator's messages.

A match of 8 or more consecutive tokens from the other party's content
triggers a filter failure.

### Retry & fallback

| Attempt | Outcome on filter match |
|---------|------------------------|
| 1       | Regenerate             |
| 2       | Regenerate             |
| 3       | Use generic fallback text; flag for admin review via audit log |

### Persistence

On success, a single mutation atomically:

1. Writes `synthesisText` and `synthesisGeneratedAt` to each party's
   `partyStates` row.
2. Transitions the case status to `READY_FOR_JOINT`.

### Model & streaming

- Model: Claude Sonnet (per TechSpec §1.2)
- Mode: one-shot, non-streaming (per TechSpec TQ3)

## Validation module

> Module: `convex/lib/synthesisValidation.ts`

Exports helpers for parsing and validating the strict JSON output schema
(`validateSynthesisOutput`), the `SynthesisOutput` type, and the
`GENERIC_FALLBACK_SYNTHESIS` fallback constant.

The token-overlap privacy filter is in `convex/lib/privacyFilter.ts`
(consumed by the synthesis action, not modified by this ticket).

## Loading state

While synthesis is in progress, clients observe a loading indicator with
the message *"Generating your guidance..."* via reactive query on the
party state.
