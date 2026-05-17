import { ConvexError, type GenericId } from "convex/values";
import {
  type Auth,
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
  type DataModelFromSchemaDefinition,
  type DocumentByName,
} from "convex/server";
import schema from "../schema.js";

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
type Doc<T extends keyof DataModel & string> = DocumentByName<DataModel, T>;
type Id<T extends keyof DataModel & string> = GenericId<T>;

export async function requireAuth(ctx: {
  auth: Auth;
  db: GenericDatabaseReader<DataModel>;
}): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED" as const,
      message: "No authenticated session",
      httpStatus: 401,
    });
  }

  const userId = identity.subject as Id<"users">;
  const user = await ctx.db.get(userId);

  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED" as const,
      message: `No user record found for subject ${identity.subject}`,
      httpStatus: 401,
    });
  }

  return user;
}

export async function getUserByEmail(
  ctx: { db: GenericDatabaseWriter<DataModel> },
  email: string,
): Promise<Doc<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  if (existing) {
    return existing;
  }

  const displayName = email.split("@")[0];
  const id = await ctx.db.insert("users", {
    email,
    displayName,
    role: "USER",
    createdAt: Date.now(),
  });

  const user = await ctx.db.get(id);
  return user!;
}

export async function requirePartyToCase(
  ctx: { db: GenericDatabaseReader<DataModel> },
  caseId: Id<"cases">,
  userId: Id<"users">,
): Promise<Doc<"cases">> {
  const caseDoc = await ctx.db.get(caseId);

  if (!caseDoc) {
    throw new ConvexError({
      code: "NOT_FOUND" as const,
      message: `Case ${caseId} not found`,
      httpStatus: 404,
    });
  }

  if (caseDoc.initiatorUserId !== userId && caseDoc.inviteeUserId !== userId) {
    throw new ConvexError({
      code: "FORBIDDEN" as const,
      message: "User is not a party to this case",
      httpStatus: 403,
    });
  }

  return caseDoc;
}

export async function requireAdmin(ctx: {
  auth: Auth;
  db: GenericDatabaseReader<DataModel>;
}): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "FORBIDDEN" as const,
      message: "Admin access required",
      httpStatus: 403,
    });
  }

  const userId = identity.subject as Id<"users">;
  const user = await ctx.db.get(userId);

  if (!user || user.role !== "ADMIN") {
    throw new ConvexError({
      code: "FORBIDDEN" as const,
      message: "Admin access required",
      httpStatus: 403,
    });
  }

  return user;
}
