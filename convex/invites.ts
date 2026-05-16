import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { tokenInvalid, conflict, forbidden } from "./lib/errors";

const URL_SAFE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Produces a 32-character crypto-random URL-safe string.
 * Uses crypto.getRandomValues on a 32-byte Uint8Array, mapped to
 * the URL-safe alphabet (64 chars, so byte % 64 has zero modulo bias).
 */
export function generateToken(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(
    randomBytes,
    (byte) => URL_SAFE_ALPHABET[byte % URL_SAFE_ALPHABET.length],
  ).join("");
}

/**
 * Returns the full invite URL for a given token.
 */
export function buildInviteUrl(token: string): string {
  return `${process.env.SITE_URL ?? "http://localhost:5173"}/invite/${token}`;
}

/**
 * Returns the active invite token URL for a case.
 * Only the case initiator may call this query.
 * Returns { token, url } or null if no active token exists.
 */
export const getForCase = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);

    const caseDoc = await ctx.db.get(caseId);
    if (!caseDoc) {
      return null;
    }

    if (caseDoc.initiatorUserId !== user._id) {
      throw forbidden("Only the case initiator can view the invite link");
    }

    const inviteToken = await ctx.db
      .query("inviteTokens")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .filter((q) => q.eq(q.field("status"), "ACTIVE"))
      .first();

    if (!inviteToken) {
      return null;
    }

    return { token: inviteToken.token, url: buildInviteUrl(inviteToken.token) };
  },
});

/**
 * Atomically redeems an invite token: binds the caller to the case,
 * creates their partyStates row, and marks the token consumed.
 */
export const redeem = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireAuth(ctx);

    // 1. Look up token via by_token index
    const inviteToken = await ctx.db
      .query("inviteTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    // 2. Validate status is ACTIVE
    if (!inviteToken || inviteToken.status !== "ACTIVE") {
      throw tokenInvalid(
        "Invite token is invalid or has already been used",
      );
    }

    // 3. Load the case
    const caseDoc = await ctx.db.get(inviteToken.caseId);
    if (!caseDoc) {
      throw tokenInvalid(
        "Invite token is invalid or has already been used",
      );
    }

    // 4. Prevent self-redeem
    if (caseDoc.initiatorUserId === user._id) {
      throw conflict(
        "Cannot redeem your own invite — you are already the initiator of this case",
      );
    }

    const now = Date.now();

    // 5. Patch case: set inviteeUserId
    await ctx.db.patch(inviteToken.caseId, {
      inviteeUserId: user._id,
      updatedAt: now,
    });

    // 6. Create partyStates row for invitee
    await ctx.db.insert("partyStates", {
      caseId: inviteToken.caseId,
      userId: user._id,
      role: "INVITEE",
    });

    // 7. Mark token as consumed
    await ctx.db.patch(inviteToken._id, {
      status: "CONSUMED",
      consumedAt: now,
      consumedByUserId: user._id,
    });

    return { caseId: inviteToken.caseId };
  },
});
