import { ConvexError } from "convex/values";

export type CaseStatus =
  | "DRAFT_PRIVATE_COACHING"
  | "BOTH_PRIVATE_COACHING"
  | "READY_FOR_JOINT"
  | "JOINT_ACTIVE"
  | "CLOSED_RESOLVED"
  | "CLOSED_UNRESOLVED"
  | "CLOSED_ABANDONED";

export type Transition =
  | "ACCEPT_INVITE"
  | "COMPLETE_COACHING"
  | "START_JOINT"
  | "RESOLVE"
  | "CLOSE_UNRESOLVED"
  | "ABANDON"
  | "DECLINE_INVITE";

export interface ClosureContext {
  partyStates: Array<{
    closureProposed: boolean | undefined;
    closureConfirmed: boolean | undefined;
  }>;
}

export const TRANSITIONS: Record<
  Transition,
  { from: CaseStatus; to: CaseStatus; transition: Transition }
> = {
  ACCEPT_INVITE: {
    from: "DRAFT_PRIVATE_COACHING",
    to: "BOTH_PRIVATE_COACHING",
    transition: "ACCEPT_INVITE",
  },
  COMPLETE_COACHING: {
    from: "BOTH_PRIVATE_COACHING",
    to: "READY_FOR_JOINT",
    transition: "COMPLETE_COACHING",
  },
  START_JOINT: {
    from: "READY_FOR_JOINT",
    to: "JOINT_ACTIVE",
    transition: "START_JOINT",
  },
  RESOLVE: {
    from: "JOINT_ACTIVE",
    to: "CLOSED_RESOLVED",
    transition: "RESOLVE",
  },
  CLOSE_UNRESOLVED: {
    from: "JOINT_ACTIVE",
    to: "CLOSED_UNRESOLVED",
    transition: "CLOSE_UNRESOLVED",
  },
  ABANDON: {
    from: "JOINT_ACTIVE",
    to: "CLOSED_ABANDONED",
    transition: "ABANDON",
  },
  DECLINE_INVITE: {
    from: "DRAFT_PRIVATE_COACHING",
    to: "CLOSED_ABANDONED",
    transition: "DECLINE_INVITE",
  },
};

export function validateTransition(
  currentStatus: CaseStatus,
  transition: Transition,
  context?: ClosureContext,
): CaseStatus {
  const entry = TRANSITIONS[transition];

  if (!entry || entry.from !== currentStatus) {
    throw new ConvexError({
      code: "CONFLICT" as const,
      message: `Cannot transition from ${currentStatus} via ${transition} — transition is not allowed from this state`,
      httpStatus: 409,
    });
  }

  if (transition === "RESOLVE") {
    if (!context) {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: `Cannot resolve: closure context is required`,
        httpStatus: 409,
      });
    }
    if (context.partyStates.length !== 2) {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: `Cannot resolve: expected exactly 2 party states, got ${context.partyStates.length}`,
        httpStatus: 409,
      });
    }
    const allConfirmed = context.partyStates.every(
      (ps) => ps.closureProposed === true && ps.closureConfirmed === true,
    );
    if (!allConfirmed) {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: `Cannot resolve: not all parties have confirmed closure`,
        httpStatus: 409,
      });
    }
  }

  return entry.to;
}
