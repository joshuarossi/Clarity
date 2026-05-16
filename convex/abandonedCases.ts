import { internalMutation } from "./_generated/server";
import { validateTransition } from "./lib/stateMachine";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const scanAndCloseAbandoned = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const threshold = now - THIRTY_DAYS_MS;

    const staleCases = await ctx.db
      .query("cases")
      .withIndex("by_status", (q) => q.eq("status", "JOINT_ACTIVE"))
      .filter((q) => q.lte(q.field("updatedAt"), threshold))
      .collect();

    for (const caseDoc of staleCases) {
      const newStatus = validateTransition(caseDoc.status, "ABANDON");

      await ctx.db.patch(caseDoc._id, {
        status: newStatus,
        closedAt: now,
        updatedAt: now,
      });

      // Notify initiator
      await ctx.db.insert("notifications", {
        userId: caseDoc.initiatorUserId,
        caseId: caseDoc._id,
        type: "CASE_ABANDONED",
        read: false,
        createdAt: now,
      });

      // Notify invitee if present
      if (caseDoc.inviteeUserId) {
        await ctx.db.insert("notifications", {
          userId: caseDoc.inviteeUserId,
          caseId: caseDoc._id,
          type: "CASE_ABANDONED",
          read: false,
          createdAt: now,
        });
      }
    }
  },
});
