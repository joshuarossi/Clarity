import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const generate = internalAction({
  args: {
    caseId: v.id("cases"),
  },
  handler: async (_ctx, _args) => {
    // Stub — synthesis generation is a separate ticket.
  },
});
