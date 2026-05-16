import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PrivacyBanner } from "../components/ui/PrivacyBanner";
import { MessageBubble } from "../components/chat/MessageBubble";
import { MessageInput } from "../components/chat/MessageInput";
import { LoadingSpinner } from "../components/layout/LoadingSpinner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/Dialog";

const PRIVATE_COACHING_STATUSES = [
  "DRAFT_PRIVATE_COACHING",
  "BOTH_PRIVATE_COACHING",
];

/* ---------- Internal subcomponents ---------- */

function MarkCompleteFooter({ onClick }: { onClick: () => void }) {
  return (
    <div
      data-testid="mark-complete-footer"
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "8px 16px",
      }}
    >
      <button
        type="button"
        className="cc-btn cc-btn-ghost cc-btn-sm"
        onClick={onClick}
      >
        Mark private coaching complete
      </button>
    </div>
  );
}

function ConfirmCompleteDialog({
  open,
  onOpenChange,
  messageCount,
  otherPartyName,
  onConfirm,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageCount: number;
  otherPartyName: string;
  onConfirm: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Ready to move on?</DialogTitle>
        <DialogDescription>
          You&apos;ve had {messageCount} messages with the Coach. Ready to move
          on to the joint session with {otherPartyName}?
        </DialogDescription>
        {error && (
          <p role="alert" style={{ color: "var(--text-error, #dc2626)", fontSize: "0.875rem", marginTop: 8 }}>
            {error}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 16,
          }}
        >
          <button
            type="button"
            className="cc-btn cc-btn-ghost cc-btn-sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Continue Coaching
          </button>
          <button
            type="button"
            className="cc-btn cc-btn-primary cc-btn-sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Completing\u2026" : "Mark Complete"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyBanner({
  otherPartyName,
  bothComplete,
}: {
  otherPartyName: string;
  bothComplete: boolean;
}) {
  const message = bothComplete
    ? "Both parties have completed private coaching."
    : `You\u2019ve completed private coaching. Waiting for ${otherPartyName} to finish.`;

  return (
    <div
      data-testid="read-only-banner"
      style={{
        textAlign: "center",
        padding: "12px 16px",
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-md)",
        color: "var(--text-secondary)",
      }}
    >
      {message}
    </div>
  );
}

/* ---------- Main page component ---------- */

export function CasePrivatePage(): React.ReactElement {
  const { caseId } = useParams<{ caseId: string }>();

  // Issue 2: Guard against undefined caseId from route params
  if (!caseId) {
    return (
      <main data-testid="page-case-private">
        <p>Invalid case URL.</p>
      </main>
    );
  }

  const typedCaseId = caseId as Id<"cases">;

  return <CasePrivatePageInner caseId={typedCaseId} />;
}

function CasePrivatePageInner({
  caseId,
}: {
  caseId: Id<"cases">;
}): React.ReactElement {
  const messages = useQuery(api.privateCoaching.myMessages, { caseId });
  const caseDoc = useQuery(api.cases.get, { caseId });
  const partyStates = useQuery(api.cases.partyStates, { caseId });
  const otherPartyNameResult = useQuery(api.cases.otherPartyName, { caseId });

  const sendUserMessage = useMutation(api.privateCoaching.sendUserMessage);
  const markComplete = useMutation(api.privateCoaching.markComplete);
  const retryLastAIResponse = useMutation(api.privateCoaching.retryLastAIResponse);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [markCompleteError, setMarkCompleteError] = React.useState<string | null>(null);
  const [markCompleteLoading, setMarkCompleteLoading] = React.useState(false);
  const [retryLoading, setRetryLoading] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isAtBottomRef = React.useRef(true);

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 50;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  React.useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Loading state
  if (
    messages === undefined ||
    caseDoc === undefined ||
    partyStates === undefined ||
    otherPartyNameResult === undefined
  ) {
    return <LoadingSpinner />;
  }

  const otherPartyName =
    otherPartyNameResult?.displayName ?? "The other party";

  const isCompleted = Boolean(partyStates.self.privateCoachingCompletedAt);
  const bothComplete = isCompleted && Boolean(partyStates.other?.hasCompletedPC);

  const isInPrivateCoachingPhase = PRIVATE_COACHING_STATUSES.includes(
    caseDoc.status,
  );
  const isReadOnly = isCompleted || !isInPrivateCoachingPhase;

  const isAiResponding = messages.some((m) => m.status === "STREAMING");

  const userMessageCount = messages.filter((m) => m.role === "USER").length;

  const handleSend = async (text: string) => {
    setSendError(null);
    try {
      await sendUserMessage({ caseId, content: text });
    } catch (err) {
      console.error("Failed to send message:", err);
      setSendError(
        err instanceof Error ? err.message : "Failed to send message. Please try again.",
      );
    }
  };

  const handleRetry = async () => {
    setRetryLoading(true);
    try {
      await retryLastAIResponse({ caseId });
    } catch (err) {
      console.error("Failed to retry AI response:", err);
    } finally {
      setRetryLoading(false);
    }
  };

  const handleMarkComplete = async () => {
    setMarkCompleteLoading(true);
    setMarkCompleteError(null);
    try {
      await markComplete({ caseId });
      setConfirmOpen(false);
    } catch (err) {
      console.error("Failed to mark coaching complete:", err);
      setMarkCompleteError(
        err instanceof Error ? err.message : "Failed to complete. Please try again.",
      );
    } finally {
      setMarkCompleteLoading(false);
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  };

  const privacyBannerCopy = `\u{1F512} This conversation is private to you. ${otherPartyName} will never see any of it.`;

  return (
    <main
      data-testid="page-case-private"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 56px)",
        maxWidth: 800,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Privacy banner — always visible */}
      <PrivacyBanner copy={privacyBannerCopy} />

      {/* Chat messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 16,
        }}
      >
        {messages.length === 0 && (
          <p
            style={{
              color: "var(--text-secondary)",
              textAlign: "center",
              marginTop: "2rem",
            }}
          >
            Start your private coaching session by sharing what&apos;s on your
            mind.
          </p>
        )}
        {messages.map((msg) => {
          const variant =
            msg.status === "ERROR"
              ? ("error" as const)
              : msg.role === "AI"
                ? ("coach" as const)
                : ("user" as const);

          const content =
            msg.status === "ERROR" && !msg.content
              ? "The AI coach encountered an error. Please retry."
              : msg.content;

          return (
            <div key={msg._id} className="cc-bubble-enter">
              <MessageBubble
                variant={variant}
                status={msg.status}
                content={content}
                createdAt={msg.createdAt}
                onRetry={msg.status === "ERROR" ? handleRetry : undefined}
                onCopy={msg.status === "COMPLETE" ? () => handleCopy(msg.content) : undefined}
              />
            </div>
          );
        })}
      </div>

      {sendError && (
        <div
          role="alert"
          style={{
            padding: "8px 16px",
            color: "var(--text-error, #dc2626)",
            fontSize: "0.875rem",
          }}
        >
          {sendError}
        </div>
      )}

      {/* Input area or read-only state */}
      {isReadOnly ? (
        <div style={{ padding: "0 16px 16px" }}>
          <ReadOnlyBanner
            otherPartyName={otherPartyName}
            bothComplete={bothComplete}
          />
        </div>
      ) : (
        <>
          <div style={{ padding: "0 16px" }}>
            <MessageInput
              onSend={handleSend}
              isAiResponding={isAiResponding}
              placeholder="Type a message..."
              autoFocus
            />
          </div>
          <MarkCompleteFooter onClick={() => setConfirmOpen(true)} />
          <ConfirmCompleteDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            messageCount={userMessageCount}
            otherPartyName={otherPartyName}
            onConfirm={handleMarkComplete}
            loading={markCompleteLoading}
            error={markCompleteError}
          />
        </>
      )}
    </main>
  );
}
