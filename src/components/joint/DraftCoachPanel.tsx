import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ChatWindow } from "../chat/ChatWindow";
import type { ChatMessage } from "../chat/MessageBubble";
import type { BubbleVariant } from "../chat/MessageBubble";
import { MessageInput } from "../chat/MessageInput";
import { LoadingSpinner } from "../layout/LoadingSpinner";
import { DraftReadyCard } from "./DraftReadyCard";

export interface DraftCoachPanelProps {
  caseId: Id<"cases">;
  otherPartyName: string;
  onClose: () => void;
  onEditBeforeSending: (draftText: string) => void;
  viewAsRole?: "INITIATOR" | "INVITEE";
}

export function DraftCoachPanel({
  caseId,
  otherPartyName,
  onClose,
  onEditBeforeSending,
}: DraftCoachPanelProps): React.ReactElement {
  const textareaContainerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const sessionData = useQuery(api.draftCoach.session, { caseId });
  const startSession = useMutation(api.draftCoach.startSession);
  const sendMessage = useMutation(api.draftCoach.sendMessage);
  const sendFinalDraft = useMutation(api.draftCoach.sendFinalDraft);
  const discardSession = useMutation(api.draftCoach.discardSession);
  const retryLastAI = useMutation(api.draftCoach.retryLastDraftAIResponse);

  const [isSending, setIsSending] = React.useState(false);
  const [startingSession, setStartingSession] = React.useState(false);
  const [sessionError, setSessionError] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sendFinalError, setSendFinalError] = React.useState<string | null>(null);

  // Start session if none exists
  React.useEffect(() => {
    if (sessionData === null && !startingSession && !sessionError) {
      setStartingSession(true);
      startSession({ caseId }).catch((err) => {
        console.error("Failed to start draft session:", err);
        setStartingSession(false);
        setSessionError(
          err instanceof Error ? err.message : "Failed to start coaching session.",
        );
      });
    }
    if (sessionData !== null && sessionData !== undefined) {
      setStartingSession(false);
      setSessionError(null);
    }
  }, [sessionData, caseId, startSession, startingSession, sessionError]);

  // If session exists but is not ACTIVE, start a fresh one
  React.useEffect(() => {
    if (
      sessionData &&
      sessionData.session.status !== "ACTIVE" &&
      !startingSession &&
      !sessionError
    ) {
      setStartingSession(true);
      startSession({ caseId }).catch((err) => {
        console.error("Failed to start fresh draft session:", err);
        setStartingSession(false);
        setSessionError(
          err instanceof Error ? err.message : "Failed to start coaching session.",
        );
      });
    }
  }, [sessionData, caseId, startSession, startingSession, sessionError]);

  // Focus textarea on mount
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const textarea = panelRef.current?.querySelector("textarea");
      if (textarea) {
        textarea.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard: Escape closes panel + focus trap (Tab/Shift+Tab)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const session = sessionData?.session;
  const messages = sessionData?.messages ?? [];

  // Map draft messages to ChatMessage format
  const chatMessages: ChatMessage[] = messages.map((msg) => {
    let variant: BubbleVariant;
    if (msg.status === "ERROR") {
      variant = "error";
    } else if (msg.role === "USER") {
      variant = "user";
    } else {
      variant = "coach";
    }

    return {
      id: msg._id,
      variant,
      status: msg.status as "STREAMING" | "COMPLETE" | "ERROR",
      content:
        msg.status === "STREAMING" && !msg.content
          ? "Coach is thinking..."
          : msg.content,
      authorName: msg.role === "AI" ? "✨" : undefined,
      createdAt: msg.createdAt,
    };
  });

  const isAiStreaming = messages.some(
    (m) => m.role === "AI" && m.status === "STREAMING",
  );

  const handleSendMessage = async (text: string) => {
    if (!session) return;
    setSendError(null);
    try {
      await sendMessage({ sessionId: session._id, content: text });
    } catch (err) {
      console.error("Failed to send draft coach message:", err);
      setSendError(
        err instanceof Error ? err.message : "Failed to send message. Please try again.",
      );
    }
  };

  const handleDraftItForMe = async () => {
    if (!session) return;
    setSendError(null);
    try {
      await sendMessage({ sessionId: session._id, content: "Generate Draft" });
    } catch (err) {
      console.error("Failed to request draft:", err);
      setSendError(
        err instanceof Error ? err.message : "Failed to request draft. Please try again.",
      );
    }
  };

  const handleSendFinalDraft = async () => {
    if (!session) return;
    setIsSending(true);
    setSendFinalError(null);
    try {
      await sendFinalDraft({ sessionId: session._id });
      onClose();
    } catch (err) {
      console.error("Failed to send final draft:", err);
      setSendFinalError(
        err instanceof Error ? err.message : "Failed to send draft to joint chat. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleEditBeforeSending = () => {
    if (!session?.finalDraft) return;
    onEditBeforeSending(session.finalDraft);
    onClose();
  };

  const handleKeepRefining = async () => {
    if (!session) return;
    // Send a continuation message — backend clears finalDraft when new message arrives
    try {
      await sendMessage({ sessionId: session._id, content: "I'd like to refine this further." });
    } catch (err) {
      console.error("Failed to continue coaching:", err);
    }
    const textarea = panelRef.current?.querySelector("textarea");
    if (textarea) {
      textarea.focus();
    }
  };

  const handleDiscard = async () => {
    if (!session) return;
    setSendFinalError(null);
    try {
      await discardSession({ sessionId: session._id });
      onClose();
    } catch (err) {
      console.error("Failed to discard session:", err);
      setSendFinalError(
        err instanceof Error ? err.message : "Failed to discard session. Please try again.",
      );
    }
  };

  const handleRetry = async () => {
    if (!session) return;
    try {
      await retryLastAI({ sessionId: session._id });
    } catch (err) {
      console.error("Failed to retry:", err);
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Draft Coach"
      className="cc-draft-coach-panel"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        maxWidth: "100vw",
        display: "flex",
        flexDirection: "column",
        background: "var(--private-tint, #F0E9E0)",
        boxShadow: "var(--shadow-3, 0 12px 32px rgba(0,0,0,.10))",
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <span style={{ color: "var(--coach-accent)" }} aria-hidden="true">
          ✨
        </span>
        <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>Draft Coach</h2>
        <span
          title={`${otherPartyName} can't see any of this. Only the final message you send goes to the joint chat.`}
          aria-label={`${otherPartyName} can't see any of this. Only the final message you send goes to the joint chat.`}
          style={{ cursor: "help" }}
        >
          🔒
        </span>
        <button
          type="button"
          className="cc-btn cc-btn-ghost cc-btn-sm"
          onClick={onClose}
          aria-label="Close Draft Coach"
        >
          ✕
        </button>
      </header>

      {/* Privacy banner */}
      <div
        className="cc-privacy-banner"
        style={{
          padding: "8px 16px",
          fontSize: 13,
          color: "var(--text-secondary)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        This is private to you. {otherPartyName} can&apos;t see what you&apos;re
        discussing here.
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, overflow: "hidden", fontSize: "14px" }}>
        {sessionError ? (
          <div style={{ padding: 16, textAlign: "center" }}>
            <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 8px" }}>
              {sessionError}
            </p>
            <button
              type="button"
              className="cc-btn cc-btn-ghost cc-btn-sm"
              onClick={() => {
                setSessionError(null);
              }}
            >
              Retry
            </button>
          </div>
        ) : sessionData === undefined || startingSession ? (
          <LoadingSpinner />
        ) : (
          <ChatWindow
            messages={chatMessages}
            className="cc-draft-coach-messages"
            onRetry={handleRetry}
            style={{ fontSize: "14px" }}
          />
        )}
      </div>

      {/* Send final error feedback */}
      {sendFinalError && (
        <p style={{ color: "var(--danger)", fontSize: 13, padding: "0 16px", margin: 0 }}>
          {sendFinalError}
        </p>
      )}

      {/* Draft Ready Card */}
      {session?.finalDraft && (
        <DraftReadyCard
          draftText={session.finalDraft}
          onSend={handleSendFinalDraft}
          onEdit={handleEditBeforeSending}
          onKeepRefining={handleKeepRefining}
          onDiscard={handleDiscard}
          isSending={isSending}
        />
      )}

      {/* Send error feedback */}
      {sendError && (
        <p style={{ color: "var(--danger)", fontSize: 13, padding: "0 16px", margin: 0 }}>
          {sendError}
        </p>
      )}

      {/* Input area */}
      {!session?.finalDraft && (
        <div
          ref={textareaContainerRef}
          style={{ padding: "8px 16px 16px", fontSize: 14 }}
        >
          <MessageInput
            onSend={handleSendMessage}
            isAiResponding={isAiStreaming}
            placeholder="Message your Draft Coach..."
            autoFocus
          />
          <button
            type="button"
            className="cc-btn cc-btn-ghost cc-btn-sm"
            onClick={handleDraftItForMe}
            disabled={isAiStreaming}
            style={{ marginTop: 8, width: "100%" }}
          >
            Draft it for me
          </button>
        </div>
      )}
    </div>
  );
}
