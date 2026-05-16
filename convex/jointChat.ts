import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, requirePartyToCase } from "./lib/auth";
import { validateTransition } from "./lib/stateMachine";

export const mySynthesis = query({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, viewAsRole }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    const caseDoc = await ctx.db.get(caseId);

    let partyState;
    if (caseDoc?.isSolo && viewAsRole) {
      const allPartyStates = await ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect();
      partyState = allPartyStates.find((ps) => ps.role === viewAsRole);
    } else {
      partyState = await ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", user._id),
        )
        .unique();
    }

    if (!partyState || !partyState.synthesisText) {
      return null;
    }

    return { text: partyState.synthesisText };
  },
});

export const enterSession = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, viewAsRole: _viewAsRole }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    const newStatus = validateTransition(caseDoc.status, "START_JOINT");

    await ctx.db.patch(caseId, {
      status: newStatus,
      updatedAt: Date.now(),
    });
  },
});

export const messages = query({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    const msgs = await ctx.db
      .query("jointMessages")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();

    return msgs.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const sendUserMessage = mutation({
  args: {
    caseId: v.id("cases"),
    content: v.string(),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, content }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    if (caseDoc.status !== "JOINT_ACTIVE") {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: "Case is not in JOINT_ACTIVE status",
        httpStatus: 409,
      });
    }

    const messageId = await ctx.db.insert("jointMessages", {
      caseId,
      authorType: "USER",
      authorUserId: user._id,
      content,
      status: "COMPLETE",
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.jointChat.generateCoachResponse,
      { caseId, messageId },
    );

    return messageId;
  },
});

export const proposeClosure = mutation({
  args: {
    caseId: v.id("cases"),
    summary: v.string(),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, summary, viewAsRole }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    if (caseDoc.status !== "JOINT_ACTIVE") {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: "Case is not in JOINT_ACTIVE status",
        httpStatus: 409,
      });
    }

    // Find caller's party state
    let callerPartyState;
    if (caseDoc.isSolo && viewAsRole) {
      const allPartyStates = await ctx.db
        .query("partyStates")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect();
      callerPartyState = allPartyStates.find((ps) => ps.role === viewAsRole);
    } else {
      callerPartyState = await ctx.db
        .query("partyStates")
        .withIndex("by_case_and_user", (q) =>
          q.eq("caseId", caseId).eq("userId", user._id),
        )
        .unique();
    }

    if (callerPartyState) {
      await ctx.db.patch(callerPartyState._id, { closureProposed: true });
    }

    await ctx.db.patch(caseId, { closureSummary: summary });
  },
});

export const confirmClosure = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, viewAsRole }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    const allPartyStates = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();

    // Determine caller's party state and the other party's state
    let callerPartyState;
    let otherPartyState;

    if (caseDoc.isSolo && viewAsRole) {
      callerPartyState = allPartyStates.find((ps) => ps.role === viewAsRole);
      otherPartyState = allPartyStates.find((ps) => ps.role !== viewAsRole);
    } else {
      callerPartyState = allPartyStates.find(
        (ps) => ps.userId === user._id,
      );
      otherPartyState = allPartyStates.find(
        (ps) => ps.userId !== user._id,
      );
    }

    if (!otherPartyState || otherPartyState.closureProposed !== true) {
      throw new ConvexError({
        code: "CONFLICT" as const,
        message: "The other party has not proposed closure",
        httpStatus: 409,
      });
    }

    // Set both parties' closureProposed and closureConfirmed
    if (callerPartyState) {
      await ctx.db.patch(callerPartyState._id, {
        closureProposed: true,
        closureConfirmed: true,
      });
    }
    await ctx.db.patch(otherPartyState._id, {
      closureConfirmed: true,
    });

    // Validate transition with updated context
    const updatedPartyStates = allPartyStates.map(() => ({
      closureProposed: true,
      closureConfirmed: true,
    }));

    const newStatus = validateTransition(caseDoc.status, "RESOLVE", {
      partyStates: updatedPartyStates,
    });

    await ctx.db.patch(caseId, {
      status: newStatus,
      closedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const unilateralClose = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    const newStatus = validateTransition(caseDoc.status, "CLOSE_UNRESOLVED");

    await ctx.db.patch(caseId, {
      status: newStatus,
      closedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const rejectClosure = mutation({
  args: {
    caseId: v.id("cases"),
    viewAsRole: v.optional(
      v.union(v.literal("INITIATOR"), v.literal("INVITEE")),
    ),
  },
  handler: async (ctx, { caseId, viewAsRole }) => {
    const user = await requireAuth(ctx);
    const caseDoc = await requirePartyToCase(ctx, caseId, user._id);

    const allPartyStates = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();

    // Find the OTHER party's state and clear their closureProposed
    let otherPartyState;
    if (caseDoc.isSolo && viewAsRole) {
      otherPartyState = allPartyStates.find((ps) => ps.role !== viewAsRole);
    } else {
      otherPartyState = allPartyStates.find(
        (ps) => ps.userId !== user._id,
      );
    }

    if (otherPartyState) {
      await ctx.db.patch(otherPartyState._id, { closureProposed: false });
    }
  },
});

// Placeholder internal action for generateCoachResponse (T31 will implement the real logic)
export const generateCoachResponse = internalAction({
  args: {
    caseId: v.id("cases"),
    messageId: v.id("jointMessages"),
  },
  handler: async () => {
    // No-op placeholder — actual implementation is in T31
  },
});
