import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
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
