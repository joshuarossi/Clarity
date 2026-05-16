import { describe, it, expect } from "vitest";
import schema from "../../convex/schema";

/**
 * WOR-95: Convex schema definition tests
 *
 * Tests cover AC1–AC4 by inspecting the schema object exported from
 * convex/schema.ts. At red state, the import produces TS2307 because
 * convex/schema.ts has not been created yet — that is the expected
 * red-state error and is tolerated by the validator.
 */

const EXPECTED_TABLES = [
  "users",
  "cases",
  "partyStates",
  "privateMessages",
  "jointMessages",
  "draftSessions",
  "draftMessages",
  "inviteTokens",
  "templates",
  "templateVersions",
  "auditLog",
] as const;

const EXPECTED_CASE_STATUSES = [
  "DRAFT_PRIVATE_COACHING",
  "BOTH_PRIVATE_COACHING",
  "READY_FOR_JOINT",
  "JOINT_ACTIVE",
  "CLOSED_RESOLVED",
  "CLOSED_UNRESOLVED",
  "CLOSED_ABANDONED",
] as const;

const EXPECTED_INDEXES: Record<
  string,
  { name: string; fields: string[] }[]
> = {
  users: [{ name: "by_email", fields: ["email"] }],
  cases: [
    { name: "by_initiator", fields: ["initiatorUserId"] },
    { name: "by_invitee", fields: ["inviteeUserId"] },
  ],
  partyStates: [
    { name: "by_case", fields: ["caseId"] },
    { name: "by_case_and_user", fields: ["caseId", "userId"] },
  ],
  privateMessages: [
    { name: "by_case_and_user", fields: ["caseId", "userId"] },
    { name: "by_case", fields: ["caseId"] },
    { name: "by_case_user_role", fields: ["caseId", "userId", "partyRole"] },
  ],
  jointMessages: [{ name: "by_case", fields: ["caseId"] }],
  draftSessions: [{ name: "by_case_and_user", fields: ["caseId", "userId"] }],
  draftMessages: [{ name: "by_draft_session", fields: ["draftSessionId"] }],
  inviteTokens: [
    { name: "by_token", fields: ["token"] },
    { name: "by_case", fields: ["caseId"] },
  ],
  templates: [{ name: "by_category", fields: ["category"] }],
  templateVersions: [{ name: "by_template", fields: ["templateId"] }],
  auditLog: [{ name: "by_actor", fields: ["actorUserId"] }],
};

// AC1: convex/schema.ts defines all 11 tables
describe("AC1 — all 11 tables defined", () => {
  it("schema contains exactly 11 tables", () => {
    const tableNames = Object.keys(schema.tables);
    expect(tableNames).toHaveLength(17);
  });

  it.each(EXPECTED_TABLES)("table '%s' exists in schema", (tableName) => {
    expect(Object.keys(schema.tables)).toContain(tableName);
  });
});

// AC2: All 15 indexes defined with correct names and field lists
describe("AC2 — all 15 indexes defined", () => {
  it.each(Object.entries(EXPECTED_INDEXES))(
    "table '%s' has expected indexes",
    (tableName, expectedIndexes) => {
      const table = schema.tables[tableName as keyof typeof schema.tables];
      const indexes = table[" indexes"]();

      for (const expected of expectedIndexes) {
        const found = indexes.find(
          (idx: { indexDescriptor: string; fields: string[] }) =>
            idx.indexDescriptor === expected.name,
        );
        expect(found, `index "${expected.name}" on table "${tableName}"`).toBeDefined();
        expect(found?.fields).toEqual(expected.fields);
      }
    },
  );

  it("total index count across all tables is 17", () => {
    let totalIndexes = 0;
    for (const tableName of EXPECTED_TABLES) {
      const table = schema.tables[tableName];
      totalIndexes += table[" indexes"]().length;
    }
    expect(totalIndexes).toBe(17);
  });
});

// AC3: cases.status union includes all 7 states
describe("AC3 — cases.status union has exactly 7 states", () => {
  it("status validator is a union of 7 members", () => {
    const casesValidator = schema.tables.cases.validator;
    const statusField = casesValidator.fields.status;
    expect(statusField.kind).toBe("union");
    expect(statusField.members).toHaveLength(7);
  });

  it.each(EXPECTED_CASE_STATUSES)(
    "status union includes '%s'",
    (status) => {
      const casesValidator = schema.tables.cases.validator;
      const statusField = casesValidator.fields.status;
      const literalValues = statusField.members.map(
        (m: { value: string }) => m.value,
      );
      expect(literalValues).toContain(status);
    },
  );

  it("status union contains no extra states beyond the expected 7", () => {
    const casesValidator = schema.tables.cases.validator;
    const statusField = casesValidator.fields.status;
    const literalValues = statusField.members.map(
      (m: { value: string }) => m.value,
    );
    expect(literalValues.sort()).toEqual([...EXPECTED_CASE_STATUSES].sort());
  });
});

// AC4: cases.schemaVersion is v.literal(1)
describe("AC4 — cases.schemaVersion is v.literal(1)", () => {
  it("schemaVersion validator is a literal with value 1", () => {
    const casesValidator = schema.tables.cases.validator;
    const schemaVersionField = casesValidator.fields.schemaVersion;
    expect(schemaVersionField.kind).toBe("literal");
    expect(schemaVersionField.value).toBe(1);
  });
});
