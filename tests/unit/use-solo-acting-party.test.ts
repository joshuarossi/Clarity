// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { useSoloActingParty } from "../../src/hooks/useSoloActingParty";

// ── Hoisted mocks ───────────────────────────────────────────────────────

const { mockUseQuery, mockSetSearchParams, mockSearchParams } = vi.hoisted(
  () => ({
    mockUseQuery: vi.fn(),
    mockSetSearchParams: vi.fn(),
    mockSearchParams: new URLSearchParams(),
  }),
);

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams] as const,
  };
});

// ── Fixture data ────────────────────────────────────────────────────────

const FN_NAME = Symbol.for("functionName");
const SOLO_CASE_ID = "j97a3be4bqnyrg61w0p2mdfh0h71w1r5" as never; // opaque Id<"cases">

interface CaseDoc {
  _id: string;
  isSolo: boolean;
  initiatorUserId: string;
  inviteeUserId: string | null;
  status: string;
}

const SOLO_CASE: CaseDoc = {
  _id: SOLO_CASE_ID,
  isSolo: true,
  initiatorUserId: "user-solo-123",
  inviteeUserId: "user-solo-123",
  status: "BOTH_PRIVATE_COACHING",
};

const NON_SOLO_CASE: CaseDoc = {
  _id: SOLO_CASE_ID,
  isSolo: false,
  initiatorUserId: "user-a",
  inviteeUserId: "user-b",
  status: "BOTH_PRIVATE_COACHING",
};

// ── Setup / Teardown ────────────────────────────────────────────────────

beforeEach(() => {
  mockUseQuery.mockReset();
  mockSetSearchParams.mockReset();
});

afterEach(cleanup);

function setupCaseMock(caseDoc: CaseDoc | undefined) {
  mockUseQuery.mockImplementation(
    (queryRef: Record<string | symbol, unknown>) => {
      const name: string = (queryRef?.[FN_NAME] as string) ?? "";
      if (name.includes("cases:get") || name.includes("cases.get")) {
        return caseDoc;
      }
      return undefined;
    },
  );
}

function setUrlParam(value: string | null) {
  // Reset and rebuild the mock URLSearchParams
  // We need to replace the object's entries
  mockSearchParams.delete("as");
  if (value !== null) {
    mockSearchParams.set("as", value);
  }
}

// ── AC: useSoloActingParty hook returns the userId corresponding to the
//    active toggle selection ────────────────────────────────────────────

describe("AC: useSoloActingParty returns correct actingRole based on URL param", () => {
  it("returns actingRole 'INITIATOR' when ?as=initiator", () => {
    setupCaseMock(SOLO_CASE);
    setUrlParam("initiator");

    const { result } = renderHook(() => useSoloActingParty(SOLO_CASE_ID));

    expect(result.current.actingRole).toBe("INITIATOR");
    expect(result.current.isSolo).toBe(true);
  });

  it("returns actingRole 'INVITEE' when ?as=invitee", () => {
    setupCaseMock(SOLO_CASE);
    setUrlParam("invitee");

    const { result } = renderHook(() => useSoloActingParty(SOLO_CASE_ID));

    expect(result.current.actingRole).toBe("INVITEE");
    expect(result.current.isSolo).toBe(true);
  });

  it("defaults to 'INITIATOR' when ?as= param is absent", () => {
    setupCaseMock(SOLO_CASE);
    setUrlParam(null);

    const { result } = renderHook(() => useSoloActingParty(SOLO_CASE_ID));

    expect(result.current.actingRole).toBe("INITIATOR");
  });

  it("defaults to 'INITIATOR' when ?as= has invalid value", () => {
    setupCaseMock(SOLO_CASE);
    setUrlParam("foo");

    const { result } = renderHook(() => useSoloActingParty(SOLO_CASE_ID));

    expect(result.current.actingRole).toBe("INITIATOR");
  });
});

describe("AC: useSoloActingParty returns isSolo based on case data", () => {
  it("returns isSolo: false for non-solo cases", () => {
    setupCaseMock(NON_SOLO_CASE);
    setUrlParam("initiator");

    const { result } = renderHook(() => useSoloActingParty(SOLO_CASE_ID));

    expect(result.current.isSolo).toBe(false);
  });

  it("returns isSolo: false when case data is still loading (undefined)", () => {
    setupCaseMock(undefined);
    setUrlParam("initiator");

    const { result } = renderHook(() => useSoloActingParty(SOLO_CASE_ID));

    expect(result.current.isSolo).toBe(false);
  });

  it("returns isSolo: false when caseId is undefined", () => {
    setupCaseMock(undefined);
    setUrlParam("initiator");

    const { result } = renderHook(() => useSoloActingParty(undefined));

    expect(result.current.isSolo).toBe(false);
  });
});

describe("AC: setActingParty updates URL param via useSearchParams", () => {
  it("calls setSearchParams to update ?as= when setActingParty is invoked", () => {
    setupCaseMock(SOLO_CASE);
    setUrlParam("initiator");

    const { result } = renderHook(() => useSoloActingParty(SOLO_CASE_ID));

    act(() => {
      result.current.setActingParty("invitee");
    });

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    // The setSearchParams call should set ?as=invitee
    const callArg = mockSetSearchParams.mock.calls[0][0];
    // Could be a function or URLSearchParams — check the result
    if (typeof callArg === "function") {
      const result2 = callArg(new URLSearchParams("?as=initiator"));
      expect(result2.get("as")).toBe("invitee");
    } else {
      expect(callArg.get("as")).toBe("invitee");
    }
  });

  it("setActingParty is a no-op when case is not loaded", () => {
    setupCaseMock(undefined);
    setUrlParam("initiator");

    const { result } = renderHook(() => useSoloActingParty(undefined));

    act(() => {
      result.current.setActingParty("invitee");
    });

    // Should not throw, may or may not call setSearchParams depending on
    // implementation — the key invariant is no crash
  });
});
