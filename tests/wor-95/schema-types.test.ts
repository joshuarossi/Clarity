import { describe, it, expect } from "vitest";
import type { DataModelFromSchemaDefinition } from "convex/server";
import schema from "../../convex/schema";

/**
 * WOR-95: Schema type-generation tests (AC6)
 *
 * Verifies that the schema definition produces a valid Convex DataModel
 * from which typed Doc<"tableName"> and Id<"tableName"> references can
 * be derived. At green state, these compile-time constraints ensure the
 * schema is compatible with Convex's type system.
 *
 * At red state, the import of convex/schema produces TS2307 — that is
 * expected because the implementation file has not been created yet.
 */

type DataModel = DataModelFromSchemaDefinition<typeof schema>;

/**
 * Compile-time assertion: verifies a table name exists in the DataModel.
 * If the schema does not define the table, TypeScript will error on the
 * call site because the literal will not satisfy `keyof DataModel`.
 * At runtime, confirms the table name is present in the schema.
 */
function assertTableInDataModel<T extends keyof DataModel>(table: T): void {
  expect(Object.keys(schema.tables)).toContain(table);
}

describe("AC6 — TypeScript types are derivable from the schema", () => {
  it("schema object is a valid SchemaDefinition", () => {
    expect(schema).toBeDefined();
    expect(schema.tables).toBeDefined();
  });

  it("DataModel includes all 11 tables", () => {
    assertTableInDataModel("users");
    assertTableInDataModel("cases");
    assertTableInDataModel("partyStates");
    assertTableInDataModel("privateMessages");
    assertTableInDataModel("jointMessages");
    assertTableInDataModel("draftSessions");
    assertTableInDataModel("draftMessages");
    assertTableInDataModel("inviteTokens");
    assertTableInDataModel("templates");
    assertTableInDataModel("templateVersions");
    assertTableInDataModel("auditLog");
  });
});
