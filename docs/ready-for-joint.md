# Ready for Joint View

> Component: `src/routes/ReadyForJointView.tsx` · Ticket: WOR-123

## Overview

The **ReadyForJointView** is the pause-and-prepare screen shown after both
parties complete private coaching and their synthesis texts are generated. It
gives each party a moment to absorb the Coach's personalised guidance before
entering the joint session together.

## Route

```
/cases/:caseId/ready
```

The `CaseDetailPage` renders this view automatically when the case status is
`READY_FOR_JOINT`. Direct navigation to `/cases/:caseId/ready` when the case
is in a different status will redirect to the appropriate phase view.

## Data source

The view subscribes to the reactive query `jointChat/mySynthesis`, which
returns the authenticated party's own `partyStates.synthesisText`. This is
strictly per-party data — the other party's synthesis is never exposed.

## Layout

1. **Intro paragraph** — "You've both completed private coaching. Here's what
   the Coach has prepared for you before the joint session:"
2. **Privacy banner** — "🔒 Private to you — [Name] has their own version"
3. **Synthesis card** — Styled with `--private-tint` background, 32 px
   padding, 14 px border-radius (StyleGuide §6.8). Contains three markdown
   H3 sections:
   - Areas of likely agreement
   - Points that will need real discussion
   - Suggested approach
4. **CTA** — "Enter Joint Session →" (large, sage fill, sole primary action).
5. **Subtext** — "[Name] will see you've entered when they enter too."

## CTA behaviour

Clicking the CTA:

1. Calls a Convex mutation that sets `case.status = JOINT_ACTIVE`.
2. Navigates to `/cases/:caseId/joint`.

Only one party needs to enter first; the other enters on their own schedule.

## Post-entry access

After entering the joint session the synthesis remains accessible via the
"View my guidance" link in the joint chat top navigation bar.

## Privacy

- The synthesis is generated and stored per-party (see [Synthesis API](synthesis-api.md)).
- The privacy banner makes it explicit that the other party has a different
  version.
- No cross-party synthesis content is ever transmitted to the client.
