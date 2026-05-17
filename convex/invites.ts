import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { tokenInvalid, conflict, forbidden } from "./lib/errors";
import { validateTransition } from "./lib/stateMachine";

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
 * Returns invite preview data for a given token string.
 * No auth required — logged-out users need the initiator's name for the heading.
 * Returns ACTIVE with preview fields, CONSUMED for used tokens, null for invalid tokens.
 * NEVER returns description, desiredOutcome, or any private data.
 */
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const inviteToken = await ctx.db
      .query("inviteTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!inviteToken) {
      return null;
    }

    if (inviteToken.status === "CONSUMED") {
      return { status: "CONSUMED" as const };
    }

    if (inviteToken.status !== "ACTIVE") {
      return null;
    }

    // Load the case
    const caseDoc = await ctx.db.get(inviteToken.caseId);
    if (!caseDoc) {
      return null;
    }

    // Load the initiator user for displayName
    const initiatorUser = await ctx.db.get(caseDoc.initiatorUserId);
    const initiatorName = initiatorUser?.displayName ?? "Someone";

    // Load the initiator's partyState for mainTopic
    const initiatorPartyState = await ctx.db
      .query("partyStates")
      .withIndex("by_case", (q) => q.eq("caseId", inviteToken.caseId))
      .filter((q) => q.eq(q.field("role"), "INITIATOR"))
      .first();

    const mainTopic = initiatorPartyState?.mainTopic ?? "";

    return {
      status: "ACTIVE" as const,
      initiatorName,
      mainTopic,
      category: caseDoc.category,
      caseId: inviteToken.caseId,
    };
  },
});

/**
 * Declines an invite: transitions the case to CLOSED_ABANDONED and marks the token CONSUMED.
 * Auth required. Prevents self-decline (initiator cannot decline own invite).
 */
export const decline = mutation({
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
      throw tokenInvalid("Invite token is invalid or has already been used");
    }

    // 3. Load the case
    const caseDoc = await ctx.db.get(inviteToken.caseId);
    if (!caseDoc) {
      throw tokenInvalid("Invite token is invalid or has already been used");
    }

    // 4. Prevent self-decline
    if (caseDoc.initiatorUserId === user._id) {
      throw conflict(
        "Cannot decline your own invite — you are the initiator of this case",
      );
    }

    // 5. Validate state machine transition
    const newStatus = validateTransition(caseDoc.status, "DECLINE_INVITE");

    const now = Date.now();

    // 6. Patch case: transition to CLOSED_ABANDONED
    await ctx.db.patch(inviteToken.caseId, {
      status: newStatus,
      closedAt: now,
      updatedAt: now,
    });

    // 7. Mark token as consumed
    await ctx.db.patch(inviteToken._id, {
      status: "CONSUMED",
      consumedAt: now,
      consumedByUserId: user._id,
    });

    return null;
  },
});

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
      throw tokenInvalid("Invite token is invalid or has already been used");
    }

    // 3. Load the case
    const caseDoc = await ctx.db.get(inviteToken.caseId);
    if (!caseDoc) {
      throw tokenInvalid("Invite token is invalid or has already been used");
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
      mainTopic: "",
      description: "",
      desiredOutcome: "",
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
