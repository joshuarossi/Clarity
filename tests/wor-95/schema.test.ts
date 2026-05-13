// @ts-expect-error WOR-95 red-state import: convex/schema.ts is created by task-implement.
import schema from "../../convex/schema";
import { describe, expect, it } from "vitest";

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the validator fields object from a table's validator. */
function getFields(tableName: string): Record<string, unknown> {
  const table = schema.tables[tableName];
  if (!table) throw new Error(`Table "${tableName}" not found in schema`);
  // Convex TableDefinition stores the document validator under `.validator`
  const validator = (table as Record<string, unknown>).validator as {
    fields: Record<string, unknown>;
  };
  return validator.fields;
}

/** Extract index descriptors from a table definition. */
function getIndexNames(tableName: string): string[] {
  const table = schema.tables[tableName];
  if (!table) throw new Error(`Table "${tableName}" not found in schema`);
  const indexes = (table as Record<string, unknown>).indexes as Array<{
    indexDescriptor: string;
  }>;
  return indexes.map((idx) => idx.indexDescriptor);
}

/** Get a single field validator from a table. */
function getFieldValidator(
  tableName: string,
  fieldName: string,
): Record<string, unknown> {
  const fields = getFields(tableName);
  const field = fields[fieldName] as Record<string, unknown> | undefined;
  if (!field)
    throw new Error(
      `Field "${fieldName}" not found on table "${tableName}"`,
    );
  return field;
}

// ─── AC 1: All 11 tables defined ───────────────────────────────────────────────

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

describe("AC 1 — All 11 tables defined", () => {
  it("schema exports a default object with a tables property", () => {
    expect(schema).toBeDefined();
    expect(schema.tables).toBeDefined();
  });

  it("defines exactly 11 tables", () => {
    const tableNames = Object.keys(schema.tables);
    expect(tableNames).toHaveLength(11);
  });

  it.each(EXPECTED_TABLES)("defines the '%s' table", (tableName) => {
    expect(schema.tables).toHaveProperty(tableName);
  });

  it("contains no extra tables beyond the 11 specified", () => {
    const tableNames = Object.keys(schema.tables).sort();
    expect(tableNames).toEqual([...EXPECTED_TABLES].sort());
  });
});

// ─── AC 1 (cont.): Field presence per table ────────────────────────────────────

describe("AC 1 — users table fields", () => {
  it.each(["email", "displayName", "role", "createdAt"])(
    "has field '%s'",
    (field) => {
      const fields = getFields("users");
      expect(fields).toHaveProperty(field);
    },
  );
});

describe("AC 1 — cases table fields", () => {
  const expectedFields = [
    "schemaVersion",
    "status",
    "isSolo",
    "category",
    "templateVersionId",
    "initiatorUserId",
    "inviteeUserId",
    "createdAt",
    "updatedAt",
    "closedAt",
    "closureSummary",
  ];
  it.each(expectedFields)("has field '%s'", (field) => {
    const fields = getFields("cases");
    expect(fields).toHaveProperty(field);
  });
});

describe("AC 1 — partyStates table fields", () => {
  it.each([
    "caseId",
    "userId",
    "role",
    "mainTopic",
    "description",
    "desiredOutcome",
    "formCompletedAt",
    "privateCoachingCompletedAt",
    "synthesisText",
    "synthesisGeneratedAt",
    "closureProposed",
    "closureConfirmed",
  ])("has field '%s'", (field) => {
    const fields = getFields("partyStates");
    expect(fields).toHaveProperty(field);
  });
});

describe("AC 1 — privateMessages table fields", () => {
  it.each(["caseId", "userId", "role", "content", "status", "tokens", "createdAt"])(
    "has field '%s'",
    (field) => {
      const fields = getFields("privateMessages");
      expect(fields).toHaveProperty(field);
    },
  );
});

describe("AC 1 — jointMessages table fields", () => {
  it.each([
    "caseId",
    "authorType",
    "authorUserId",
    "content",
    "status",
    "isIntervention",
    "replyToId",
    "createdAt",
  ])("has field '%s'", (field) => {
    const fields = getFields("jointMessages");
    expect(fields).toHaveProperty(field);
  });
});

describe("AC 1 — draftSessions table fields", () => {
  it.each(["caseId", "userId", "status", "createdAt", "completedAt", "finalDraft"])(
    "has field '%s'",
    (field) => {
      const fields = getFields("draftSessions");
      expect(fields).toHaveProperty(field);
    },
  );
});

describe("AC 1 — draftMessages table fields", () => {
  it.each(["draftSessionId", "role", "content", "status", "createdAt"])(
    "has field '%s'",
    (field) => {
      const fields = getFields("draftMessages");
      expect(fields).toHaveProperty(field);
    },
  );
});

describe("AC 1 — inviteTokens table fields", () => {
  it.each([
    "caseId",
    "token",
    "status",
    "createdAt",
    "consumedAt",
    "consumedByUserId",
  ])("has field '%s'", (field) => {
    const fields = getFields("inviteTokens");
    expect(fields).toHaveProperty(field);
  });
});

describe("AC 1 — templates table fields", () => {
  it.each([
    "category",
    "name",
    "currentVersionId",
    "archivedAt",
    "createdAt",
    "createdByUserId",
  ])("has field '%s'", (field) => {
    const fields = getFields("templates");
    expect(fields).toHaveProperty(field);
  });
});

describe("AC 1 — templateVersions table fields", () => {
  it.each([
    "templateId",
    "version",
    "globalGuidance",
    "coachInstructions",
    "draftCoachInstructions",
    "publishedAt",
    "publishedByUserId",
    "notes",
  ])("has field '%s'", (field) => {
    const fields = getFields("templateVersions");
    expect(fields).toHaveProperty(field);
  });
});

describe("AC 1 — auditLog table fields", () => {
  it.each([
    "actorUserId",
    "action",
    "targetType",
    "targetId",
    "metadata",
    "createdAt",
  ])("has field '%s'", (field) => {
    const fields = getFields("auditLog");
    expect(fields).toHaveProperty(field);
  });
});

// ─── AC 2: All 15 indexes defined ─────────────────────────────────────────────

describe("AC 2 — All indexes defined", () => {
  const INDEX_MAP: Record<string, string[]> = {
    users: ["by_email"],
    cases: ["by_initiator", "by_invitee"],
    partyStates: ["by_case", "by_case_and_user"],
    privateMessages: ["by_case_and_user", "by_case"],
    jointMessages: ["by_case"],
    draftSessions: ["by_case_and_user"],
    draftMessages: ["by_draft_session"],
    inviteTokens: ["by_token", "by_case"],
    templates: ["by_category"],
    templateVersions: ["by_template"],
    auditLog: ["by_actor"],
  };

  for (const [table, expectedIndexes] of Object.entries(INDEX_MAP)) {
    describe(`${table} indexes`, () => {
      it.each(expectedIndexes)(`has index '%s'`, (indexName) => {
        const actualIndexes = getIndexNames(table);
        expect(actualIndexes).toContain(indexName);
      });
    });
  }

  it("has exactly 15 indexes total across all tables", () => {
    let totalIndexes = 0;
    for (const tableName of EXPECTED_TABLES) {
      totalIndexes += getIndexNames(tableName).length;
    }
    expect(totalIndexes).toBe(15);
  });
});

// ─── AC 3: cases.status union includes all 7 states ────────────────────────────

describe("AC 3 — cases.status 7-value union", () => {
  const EXPECTED_STATUSES = [
    "DRAFT_PRIVATE_COACHING",
    "BOTH_PRIVATE_COACHING",
    "READY_FOR_JOINT",
    "JOINT_ACTIVE",
    "CLOSED_RESOLVED",
    "CLOSED_UNRESOLVED",
    "CLOSED_ABANDONED",
  ] as const;

  it("cases.status is a union validator", () => {
    const statusField = getFieldValidator("cases", "status");
    expect(statusField.kind).toBe("union");
  });

  it("cases.status union has exactly 7 members", () => {
    const statusField = getFieldValidator("cases", "status");
    const members = statusField.members as unknown[];
    expect(members).toHaveLength(7);
  });

  it.each(EXPECTED_STATUSES)(
    "cases.status union includes '%s'",
    (status) => {
      const statusField = getFieldValidator("cases", "status");
      const members = statusField.members as Array<{
        kind: string;
        value: string;
      }>;
      const values = members.map((m) => m.value);
      expect(values).toContain(status);
    },
  );

  it("every member of cases.status is a literal validator", () => {
    const statusField = getFieldValidator("cases", "status");
    const members = statusField.members as Array<{ kind: string }>;
    for (const member of members) {
      expect(member.kind).toBe("literal");
    }
  });
});

// ─── AC 4: cases.schemaVersion is v.literal(1) ────────────────────────────────

describe("AC 4 — cases.schemaVersion is v.literal(1)", () => {
  it("schemaVersion validator kind is 'literal'", () => {
    const sv = getFieldValidator("cases", "schemaVersion");
    expect(sv.kind).toBe("literal");
  });

  it("schemaVersion literal value is exactly 1", () => {
    const sv = getFieldValidator("cases", "schemaVersion");
    expect(sv.value).toBe(1);
  });

  it("schemaVersion is not a float64 (v.number()) validator", () => {
    const sv = getFieldValidator("cases", "schemaVersion");
    expect(sv.kind).not.toBe("float64");
  });
});

// ─── Contract invariants ───────────────────────────────────────────────────────

describe("Contract invariants", () => {
  it("cases.templateVersionId is v.id('templateVersions')", () => {
    const field = getFieldValidator("cases", "templateVersionId");
    expect(field.kind).toBe("id");
    expect(field.tableName).toBe("templateVersions");
  });

  it("auditLog.metadata is v.optional(v.any())", () => {
    const field = getFieldValidator("auditLog", "metadata");
    expect(field.isOptional).toBe("optional");
    expect(field.kind).toBe("any");
  });

  it("users.role uses v.union(v.literal(...)), not v.string()", () => {
    const field = getFieldValidator("users", "role");
    expect(field.kind).toBe("union");
    expect(field.kind).not.toBe("string");
  });

  it("privateMessages.role uses v.union(v.literal(...)), not v.string()", () => {
    const field = getFieldValidator("privateMessages", "role");
    expect(field.kind).toBe("union");
  });

  it("privateMessages.status uses v.union(v.literal(...)), not v.string()", () => {
    const field = getFieldValidator("privateMessages", "status");
    expect(field.kind).toBe("union");
  });

  it("inviteTokens.status uses v.union(v.literal(...)), not v.string()", () => {
    const field = getFieldValidator("inviteTokens", "status");
    expect(field.kind).toBe("union");
  });

  it("draftSessions.status uses v.union(v.literal(...)), not v.string()", () => {
    const field = getFieldValidator("draftSessions", "status");
    expect(field.kind).toBe("union");
  });

  it("jointMessages.authorType uses v.union(v.literal(...)), not v.string()", () => {
    const field = getFieldValidator("jointMessages", "authorType");
    expect(field.kind).toBe("union");
  });
});
