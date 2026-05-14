## WOR-96 — Case lifecycle state machine helper

Added the case lifecycle state machine (`convex/lib/stateMachine.ts`), a
pure helper that enforces all 7 legal status transitions for a mediation
case. Every mutation that changes case status calls `validateTransition`,
which returns the new status on success or throws a structured CONFLICT
error on illegal jumps. The RESOLVE transition additionally requires both
parties to have confirmed closure before a case can be marked resolved.
