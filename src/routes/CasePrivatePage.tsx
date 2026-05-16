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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageCount: number;
  otherPartyName: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Ready to move on?</DialogTitle>
        <DialogDescription>
          You&apos;ve had {messageCount} messages with the Coach. Ready to move
          on to the joint session with {otherPartyName}?
        </DialogDescription>
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
          >
            Continue Coaching
          </button>
          <button
            type="button"
            className="cc-btn cc-btn-primary cc-btn-sm"
            onClick={onConfirm}
          >
            Mark Complete
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
  const typedCaseId = caseId as Id<"cases">;

  const messages = useQuery(api.privateCoaching.myMessages, { caseId: typedCaseId });
  const caseDoc = useQuery(api.cases.get, { caseId: typedCaseId });
  const partyStates = useQuery(api.cases.partyStates, { caseId: typedCaseId });
  const otherPartyNameResult = useQuery(api.cases.otherPartyName, { caseId: typedCaseId });

  const sendUserMessage = useMutation(api.privateCoaching.sendUserMessage);
  const markComplete = useMutation(api.privateCoaching.markComplete);
  const retryLastAIResponse = useMutation(api.privateCoaching.retryLastAIResponse);

  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isAtBottomRef = React.useRef(true);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

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

  // Focus input on mount
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const handleSend = (text: string) => {
    sendUserMessage({ caseId: typedCaseId, content: text });
  };

  const handleRetry = () => {
    retryLastAIResponse({ caseId: typedCaseId });
  };

  const handleMarkComplete = () => {
    markComplete({ caseId: typedCaseId });
    setConfirmOpen(false);
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
                onCopy={msg.status === "COMPLETE" ? () => {} : undefined}
              />
            </div>
          );
        })}
      </div>

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
            />
          </div>
          <MarkCompleteFooter onClick={() => setConfirmOpen(true)} />
          <ConfirmCompleteDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            messageCount={userMessageCount}
            otherPartyName={otherPartyName}
            onConfirm={handleMarkComplete}
          />
        </>
      )}
    </main>
  );
}
