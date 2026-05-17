import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const userId = identity.subject as Id<"users">;
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    return user;
  },
});

export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const user = await requireAuth(ctx);
    const trimmed = displayName.trim();
    if (!trimmed) {
      throw new Error("Display name cannot be empty");
    }
    await ctx.db.patch(user._id, { displayName: trimmed });
    return null;
  },
});
