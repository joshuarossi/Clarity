import { v } from "convex/values";
import { query, mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, requirePartyToCase } from "./lib/auth";
import { conflict, forbidden, notFound } from "./lib/errors";

export const session = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    const sessions = await ctx.db
      .query("draftSessions")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", caseId).eq("userId", user._id),
      )
      .collect();

    const activeSession = sessions.find((s) => s.status === "ACTIVE");
    if (!activeSession) {
      return null;
    }

    const messages = await ctx.db
      .query("draftMessages")
      .withIndex("by_draft_session", (q) =>
        q.eq("draftSessionId", activeSession._id),
      )
      .collect();

    return { session: activeSession, messages };
  },
});

export const startSession = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await requireAuth(ctx);
    await requirePartyToCase(ctx, caseId, user._id);

    // Check for existing ACTIVE session
    const existing = await ctx.db
      .query("draftSessions")
      .withIndex("by_case_and_user", (q) =>
        q.eq("caseId", caseId).eq("userId", user._id),
      )
      .collect();

    const activeSession = existing.find((s) => s.status === "ACTIVE");
    if (activeSession) {
      throw conflict("An active draft session already exists for this case");
    }

    const sessionId = await ctx.db.insert("draftSessions", {
      caseId,
      userId: user._id,
      status: "ACTIVE",
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.draftCoach.generateResponse, {
      sessionId,
      userId: user._id,
    });

    return sessionId;
  },
});

export const sendMessage = mutation({
  args: { sessionId: v.id("draftSessions"), content: v.string() },
  handler: async (ctx, { sessionId, content }) => {
    const user = await requireAuth(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw notFound("Draft session not found");
    }

    await requirePartyToCase(ctx, session.caseId, user._id);

    if (session.userId !== user._id) {
      throw forbidden("You do not own this draft session");
    }

    if (session.status !== "ACTIVE") {
      throw conflict("Draft session is not active");
    }

    const messageId = await ctx.db.insert("draftMessages", {
      draftSessionId: sessionId,
      role: "USER",
      content,
      status: "COMPLETE",
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.draftCoach.generateResponse, {
      sessionId,
      userId: user._id,
    });

    return messageId;
  },
});

export const sendFinalDraft = mutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireAuth(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw notFound("Draft session not found");
    }

    await requirePartyToCase(ctx, session.caseId, user._id);

    if (session.userId !== user._id) {
      throw forbidden("You do not own this draft session");
    }

    if (session.status !== "ACTIVE") {
      throw conflict("Draft session is not active");
    }

    if (!session.finalDraft) {
      throw conflict("No final draft available — the Coach has not produced a draft yet");
    }

    // Insert directly into jointMessages (mutations cannot call other mutations)
    const messageId = await ctx.db.insert("jointMessages", {
      caseId: session.caseId,
      authorType: "USER",
      authorUserId: session.userId,
      content: session.finalDraft,
      status: "COMPLETE",
      createdAt: Date.now(),
    });

    // Schedule coach response in joint chat
    await ctx.scheduler.runAfter(
      0,
      internal.jointChat.generateCoachResponse,
      { caseId: session.caseId, messageId },
    );

    // Mark session as SENT
    await ctx.db.patch(sessionId, {
      status: "SENT",
      completedAt: Date.now(),
    });

    return messageId;
  },
});

export const discardSession = mutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireAuth(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw notFound("Draft session not found");
    }

    await requirePartyToCase(ctx, session.caseId, user._id);

    if (session.userId !== user._id) {
      throw forbidden("You do not own this draft session");
    }

    if (session.status !== "ACTIVE") {
      throw conflict("Draft session is not active");
    }

    await ctx.db.patch(sessionId, {
      status: "DISCARDED",
      completedAt: Date.now(),
    });
  },
});

// Stub internalAction for T34 — Draft Coach AI generation
export const generateResponse = internalAction({
  args: { sessionId: v.id("draftSessions"), userId: v.id("users") },
  handler: async () => {
    // No-op stub — T34 will implement the full AI generation
  },
});
