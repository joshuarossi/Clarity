import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requirePartyToCase } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const byInitiator = await ctx.db
      .query("cases")
      .withIndex("by_initiator", (q) => q.eq("initiatorUserId", user._id))
      .collect();

    const byInvitee = await ctx.db
      .query("cases")
      .withIndex("by_invitee", (q) => q.eq("inviteeUserId", user._id))
      .collect();

    const seen = new Set<string>();
    const all = [];
    for (const c of [...byInitiator, ...byInvitee]) {
      if (!seen.has(c._id)) {
        seen.add(c._id);
        all.push(c);
      }
    }

    all.sort((a, b) => b.updatedAt - a.updatedAt);
    return all;
  },
});

export const get = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);
    return caseDoc;
  },
});

export const partyStates = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    const allPartyStates = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();

    const caseDoc = await ctx.db.get(caseId);

    let self;
    let otherPartyState;

    if (caseDoc?.isSolo) {
      self = allPartyStates.find((ps) => ps.role === "INITIATOR");
      otherPartyState = allPartyStates.find((ps) => ps.role === "INVITEE");
    } else {
      self = allPartyStates.find((ps) => ps.userId === user._id);
      otherPartyState = allPartyStates.find(
        (ps) => ps.userId !== user._id,
      );
    }

    if (!self) {
      throw new ConvexError({
        code: "NOT_FOUND" as const,
        message: "Party state not found for caller",
        httpStatus: 404,
      });
    }

    const other = otherPartyState
      ? {
          role: otherPartyState.role,
          hasCompletedPC: Boolean(
            otherPartyState.privateCoachingCompletedAt,
          ),
        }
      : null;

    return { self, other };
  },
});

export const create = mutation({
  args: {
    category: v.string(),
    mainTopic: v.string(),
    description: v.string(),
    desiredOutcome: v.string(),
    templateId: v.optional(v.id("templates")),
    isSolo: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Resolve template
    let template;
    if (args.templateId) {
      template = await ctx.db.get(args.templateId);
    } else {
      template = await ctx.db
        .query("templates")
        .withIndex("by_category", (q) => q.eq("category", args.category))
        .first();
    }

    if (!template || !template.currentVersionId) {
      throw new ConvexError({
        code: "INVALID_INPUT" as const,
        message: "No template or active version found for category",
        httpStatus: 400,
      });
    }

    const isSolo = args.isSolo ?? false;
    const now = Date.now();

    const caseId = await ctx.db.insert("cases", {
      schemaVersion: 1 as const,
      status: isSolo ? "BOTH_PRIVATE_COACHING" : "DRAFT_PRIVATE_COACHING",
      isSolo,
      category: args.category,
      templateVersionId: template.currentVersionId,
      initiatorUserId: user._id,
      inviteeUserId: isSolo ? user._id : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Create initiator partyState
    await ctx.db.insert("partyStates", {
      caseId,
      userId: user._id,
      role: "INITIATOR",
      mainTopic: args.mainTopic,
      description: args.description,
      desiredOutcome: args.desiredOutcome,
      formCompletedAt: now,
    });

    if (isSolo) {
      // Create invitee partyState for same user
      await ctx.db.insert("partyStates", {
        caseId,
        userId: user._id,
        role: "INVITEE",
      });
      return { caseId, inviteUrl: null };
    }

    // Standard mode: generate invite token
    const token = generateToken();
    await ctx.db.insert("inviteTokens", {
      caseId,
      token,
      status: "ACTIVE",
      createdAt: now,
    });

    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) {
      throw new ConvexError({
        code: "INTERNAL" as const,
        message: "SITE_URL environment variable is not configured",
        httpStatus: 500,
      });
    }
    return { caseId, inviteUrl: `${siteUrl}/invite/${token}` };
  },
});

export const updateMyForm = mutation({
  args: {
    caseId: v.id("cases"),
    mainTopic: v.string(),
    description: v.string(),
    desiredOutcome: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, args.caseId, user._id);

    const partyState = await ctx.db
      .query("partyStates")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", args.caseId).eq("userId", user._id),
      )
      .unique();

    if (!partyState) {
      throw new ConvexError({
        code: "NOT_FOUND" as const,
        message: "Party state not found",
        httpStatus: 404,
      });
    }

    await ctx.db.patch(partyState._id, {
      mainTopic: args.mainTopic,
      description: args.description,
      desiredOutcome: args.desiredOutcome,
    });

    await ctx.db.patch(args.caseId, {
      updatedAt: Date.now(),
    });

    return null;
  },
});

function generateToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (byte) => chars[byte % chars.length]).join("");
}
