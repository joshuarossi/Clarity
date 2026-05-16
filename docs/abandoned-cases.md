# Abandoned Case Cron Job

Clarity automatically closes cases that have gone dormant so stale cases
do not clutter participants' dashboards.

## How it works

A daily Convex cron job (`convex/crons.ts`) invokes the internal mutation
`abandonedCases:scanAndCloseAbandoned`. The mutation:

1. Queries all cases with `status = JOINT_ACTIVE` where `updatedAt` is
   older than 30 days.
2. Transitions each matching case to `CLOSED_ABANDONED` via the state
   machine helper (`validateTransition`).
3. Creates a `CASE_ABANDONED` notification record for the initiator and,
   if present, the invitee so they see a dashboard badge.

## Threshold

The inactivity threshold is **30 days**, measured against the case's
`updatedAt` timestamp. Any mutation that touches a case resets the clock.

## Notifications

When a case is abandoned, each party receives a dashboard notification
(type `CASE_ABANDONED`). No email is sent in v1.

## Related

- [State Machine](./state-machine.md) — allowed transitions including
  `JOINT_ACTIVE → CLOSED_ABANDONED`.
- [Cases API](./cases-api.md) — case lifecycle and status fields.
