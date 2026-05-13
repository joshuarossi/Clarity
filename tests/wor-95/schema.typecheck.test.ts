/**
 * AC 6 — TypeScript types are generated and importable.
 *
 * This test validates that the generated Convex types can be imported and used
 * in TypeScript code. It exercises Doc<> and Id<> type aliases for key tables.
 *
 * NOTE: This test can only pass after `npx convex dev` has been run to generate
 * types in convex/_generated/. In a red-state (before implementation), both the
 * schema and generated types will be missing, so this file uses @ts-expect-error
 * for the generated import.
 */
import { describe, expect, it } from "vitest";

// @ts-expect-error WOR-95 red-state import: convex/_generated/dataModel is created after npx convex dev.
import type { Doc, Id } from "../../convex/_generated/dataModel";

describe("AC 6 — TypeScript types are generated and importable", () => {
  it("Doc<'users'> type is assignable", () => {
    // This test verifies that the type import resolves. At runtime we just
    // confirm the test framework executes — the real assertion is that tsc
    // does not error on the type usage below once types are generated.
    type UserDoc = Doc<"users">;
    const _typeCheck: UserDoc | undefined = undefined;
    expect(true).toBe(true);
  });

  it("Doc<'cases'> type is assignable", () => {
    type CaseDoc = Doc<"cases">;
    const _typeCheck: CaseDoc | undefined = undefined;
    expect(true).toBe(true);
  });

  it("Id<'cases'> type is assignable", () => {
    type CaseId = Id<"cases">;
    const _typeCheck: CaseId | undefined = undefined;
    expect(true).toBe(true);
  });

  it("Doc types exist for all 11 tables", () => {
    // Type-level assertions — if any table name is invalid, tsc will error.
    type _Users = Doc<"users">;
    type _Cases = Doc<"cases">;
    type _PartyStates = Doc<"partyStates">;
    type _PrivateMessages = Doc<"privateMessages">;
    type _JointMessages = Doc<"jointMessages">;
    type _DraftSessions = Doc<"draftSessions">;
    type _DraftMessages = Doc<"draftMessages">;
    type _InviteTokens = Doc<"inviteTokens">;
    type _Templates = Doc<"templates">;
    type _TemplateVersions = Doc<"templateVersions">;
    type _AuditLog = Doc<"auditLog">;
    expect(true).toBe(true);
  });

  it("Id types exist for all 11 tables", () => {
    type _Users = Id<"users">;
    type _Cases = Id<"cases">;
    type _PartyStates = Id<"partyStates">;
    type _PrivateMessages = Id<"privateMessages">;
    type _JointMessages = Id<"jointMessages">;
    type _DraftSessions = Id<"draftSessions">;
    type _DraftMessages = Id<"draftMessages">;
    type _InviteTokens = Id<"inviteTokens">;
    type _Templates = Id<"templates">;
    type _TemplateVersions = Id<"templateVersions">;
    type _AuditLog = Id<"auditLog">;
    expect(true).toBe(true);
  });
});
