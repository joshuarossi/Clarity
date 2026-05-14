import { describe, it, expect } from "vitest";
import { ConvexError } from "convex/values";
import {
  validateTransition,
  TRANSITIONS,
} from "../../convex/lib/stateMachine";
import type {
  CaseStatus,
  Transition,
  ClosureContext,
} from "../../convex/lib/stateMachine";

/**
 * WOR-96: Case lifecycle state machine helper tests
 *
 * Tests cover all 5 acceptance criteria by exercising validateTransition
 * against every legal transition, illegal transitions, and closure
 * preconditions. At red state, the import from convex/lib/stateMachine.ts
 * produces TS2307 because the module has not been created yet — that is
 * the expected red-state error and is tolerated by the validator.
 */

// ── Legal transitions (all 7) ──────────────────────────────────────

const LEGAL_TRANSITIONS: [CaseStatus, Transition, CaseStatus][] = [
  ["DRAFT_PRIVATE_COACHING", "ACCEPT_INVITE", "BOTH_PRIVATE_COACHING"],
  ["BOTH_PRIVATE_COACHING", "COMPLETE_COACHING", "READY_FOR_JOINT"],
  ["READY_FOR_JOINT", "START_JOINT", "JOINT_ACTIVE"],
  ["JOINT_ACTIVE", "RESOLVE", "CLOSED_RESOLVED"],
  ["JOINT_ACTIVE", "CLOSE_UNRESOLVED", "CLOSED_UNRESOLVED"],
  ["JOINT_ACTIVE", "ABANDON", "CLOSED_ABANDONED"],
  ["DRAFT_PRIVATE_COACHING", "DECLINE_INVITE", "CLOSED_ABANDONED"],
];

// ── Illegal transitions (at least 5) ──────────────────────────────

const ILLEGAL_TRANSITIONS: [CaseStatus, Transition][] = [
  ["DRAFT_PRIVATE_COACHING", "START_JOINT"],
  ["CLOSED_RESOLVED", "ACCEPT_INVITE"],
  ["READY_FOR_JOINT", "DECLINE_INVITE"],
  ["CLOSED_ABANDONED", "RESOLVE"],
  ["BOTH_PRIVATE_COACHING", "RESOLVE"],
  ["CLOSED_UNRESOLVED", "COMPLETE_COACHING"],
  ["JOINT_ACTIVE", "ACCEPT_INVITE"],
];

// ── Valid closure context ──────────────────────────────────────────

const VALID_CLOSURE_CONTEXT: ClosureContext = {
  partyStates: [
    { closureProposed: true, closureConfirmed: true },
    { closureProposed: true, closureConfirmed: true },
  ],
};

// AC1: Module exports a validateTransition function that takes current
// status + requested transition and returns the new status or throws CONFLICT
describe("AC1 — validateTransition interface", () => {
  it("returns the new status for a valid transition", () => {
    const result = validateTransition(
      "DRAFT_PRIVATE_COACHING",
      "ACCEPT_INVITE",
    );
    expect(result).toBe("BOTH_PRIVATE_COACHING");
  });

  it("TRANSITIONS map is exported for test introspection", () => {
    expect(TRANSITIONS).toBeDefined();
    expect(typeof TRANSITIONS).toBe("object");
  });
});

// AC2: All 7 transitions are implemented
describe("AC2 — all 7 legal transitions", () => {
  it.each(LEGAL_TRANSITIONS)(
    "%s + %s → %s",
    (currentStatus, transition, expectedNewStatus) => {
      const context =
        transition === "RESOLVE" ? VALID_CLOSURE_CONTEXT : undefined;
      const result = validateTransition(currentStatus, transition, context);
      expect(result).toBe(expectedNewStatus);
    },
  );

  it("TRANSITIONS map contains exactly 7 entries", () => {
    const entries = Object.keys(TRANSITIONS);
    expect(entries).toHaveLength(7);
  });
});

// AC3: Illegal transitions throw ConvexError with code CONFLICT and a
// descriptive message naming both the current state and the attempted transition
describe("AC3 — illegal transitions throw CONFLICT", () => {
  it.each(ILLEGAL_TRANSITIONS)(
    "%s + %s → throws CONFLICT",
    (currentStatus, transition) => {
      expect(() => validateTransition(currentStatus, transition)).toThrow(
        ConvexError,
      );

      try {
        validateTransition(currentStatus, transition);
      } catch (err) {
        const convexErr = err as ConvexError<{
          code: string;
          message: string;
          httpStatus: number;
        }>;
        expect(convexErr.data.code).toBe("CONFLICT");
        expect(convexErr.data.httpStatus).toBe(409);
        expect(convexErr.data.message).toContain(currentStatus);
        expect(convexErr.data.message).toContain(transition);
      }
    },
  );

  it("terminal status CLOSED_RESOLVED has no outbound transitions", () => {
    const allTransitions: Transition[] = [
      "ACCEPT_INVITE",
      "COMPLETE_COACHING",
      "START_JOINT",
      "RESOLVE",
      "CLOSE_UNRESOLVED",
      "ABANDON",
      "DECLINE_INVITE",
    ];
    for (const transition of allTransitions) {
      expect(() =>
        validateTransition("CLOSED_RESOLVED", transition),
      ).toThrow(ConvexError);
    }
  });

  it("terminal status CLOSED_UNRESOLVED has no outbound transitions", () => {
    const allTransitions: Transition[] = [
      "ACCEPT_INVITE",
      "COMPLETE_COACHING",
      "START_JOINT",
      "RESOLVE",
      "CLOSE_UNRESOLVED",
      "ABANDON",
      "DECLINE_INVITE",
    ];
    for (const transition of allTransitions) {
      expect(() =>
        validateTransition("CLOSED_UNRESOLVED", transition),
      ).toThrow(ConvexError);
    }
  });

  it("terminal status CLOSED_ABANDONED has no outbound transitions", () => {
    const allTransitions: Transition[] = [
      "ACCEPT_INVITE",
      "COMPLETE_COACHING",
      "START_JOINT",
      "RESOLVE",
      "CLOSE_UNRESOLVED",
      "ABANDON",
      "DECLINE_INVITE",
    ];
    for (const transition of allTransitions) {
      expect(() =>
        validateTransition("CLOSED_ABANDONED", transition),
      ).toThrow(ConvexError);
    }
  });
});

// AC5: Closure transition (JOINT_ACTIVE → CLOSED_RESOLVED) requires both
// partyStates to have closureProposed=true and closureConfirmed=true
describe("AC5 — RESOLVE closure precondition", () => {
  it("throws CONFLICT when no context is provided", () => {
    expect(() =>
      validateTransition("JOINT_ACTIVE", "RESOLVE"),
    ).toThrow(ConvexError);

    try {
      validateTransition("JOINT_ACTIVE", "RESOLVE");
    } catch (err) {
      const convexErr = err as ConvexError<{
        code: string;
        message: string;
        httpStatus: number;
      }>;
      expect(convexErr.data.code).toBe("CONFLICT");
    }
  });

  it("throws CONFLICT when one party has closureConfirmed=false", () => {
    const partialContext: ClosureContext = {
      partyStates: [
        { closureProposed: true, closureConfirmed: true },
        { closureProposed: true, closureConfirmed: false },
      ],
    };
    expect(() =>
      validateTransition("JOINT_ACTIVE", "RESOLVE", partialContext),
    ).toThrow(ConvexError);
  });

  it("throws CONFLICT when one party has closureProposed=false", () => {
    const partialContext: ClosureContext = {
      partyStates: [
        { closureProposed: false, closureConfirmed: true },
        { closureProposed: true, closureConfirmed: true },
      ],
    };
    expect(() =>
      validateTransition("JOINT_ACTIVE", "RESOLVE", partialContext),
    ).toThrow(ConvexError);
  });

  it("throws CONFLICT when closureConfirmed is undefined", () => {
    const undefinedContext: ClosureContext = {
      partyStates: [
        { closureProposed: true, closureConfirmed: undefined },
        { closureProposed: true, closureConfirmed: true },
      ],
    };
    expect(() =>
      validateTransition("JOINT_ACTIVE", "RESOLVE", undefinedContext),
    ).toThrow(ConvexError);
  });

  it("throws CONFLICT when partyStates has fewer than 2 entries", () => {
    const singlePartyContext: ClosureContext = {
      partyStates: [
        { closureProposed: true, closureConfirmed: true },
      ],
    };
    expect(() =>
      validateTransition("JOINT_ACTIVE", "RESOLVE", singlePartyContext),
    ).toThrow(ConvexError);
  });

  it("succeeds when both parties have closureProposed=true and closureConfirmed=true", () => {
    const result = validateTransition(
      "JOINT_ACTIVE",
      "RESOLVE",
      VALID_CLOSURE_CONTEXT,
    );
    expect(result).toBe("CLOSED_RESOLVED");
  });

  it("extra context is ignored for non-RESOLVE transitions", () => {
    const result = validateTransition(
      "DRAFT_PRIVATE_COACHING",
      "ACCEPT_INVITE",
      VALID_CLOSURE_CONTEXT,
    );
    expect(result).toBe("BOTH_PRIVATE_COACHING");
  });
});
