import * as React from "react";
import { useParams, Navigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ChatWindow } from "../components/chat/ChatWindow";
import type { ChatMessage } from "../components/chat/MessageBubble";
import type { BubbleVariant } from "../components/chat/MessageBubble";
import { MessageInput } from "../components/chat/MessageInput";
import { LoadingSpinner } from "../components/layout/LoadingSpinner";
import { PhaseHeader } from "../components/layout/PhaseHeader";
import { PartyToggle } from "../components/layout/PartyToggle";
import { useSoloActingParty } from "../hooks/useSoloActingParty";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/Dialog";

/* ---------- Synthesis Side Panel ---------- */

function SynthesisPanel({
  open,
  onClose,
  text,
}: {
  open: boolean;
  onClose: () => void;
  text: string | null;
}) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>My Guidance</DialogTitle>
        <DialogDescription>
          {text ?? "Synthesis not available."}
        </DialogDescription>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            className="cc-btn cc-btn-ghost cc-btn-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Closure Modal ---------- */

function ClosureModal({
  open,
  onOpenChange,
  onProposeClosure,
  onUnilateralClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProposeClosure: (summary: string) => Promise<void>;
  onUnilateralClose: () => Promise<void>;
}) {
  const [summary, setSummary] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handlePropose = async () => {
    if (!summary.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onProposeClosure(summary.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose closure.");
    } finally {
      setLoading(false);
    }
  };

  const handleWalkAway = async () => {
    setLoading(true);
    setError(null);
    try {
      await onUnilateralClose();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close session.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Close Session</DialogTitle>
        <DialogDescription>
          Propose a resolution summary or walk away from the session.
        </DialogDescription>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Summarize the resolution..."
          rows={3}
          aria-label="Closure summary"
          style={{
            width: "100%",
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            resize: "none",
          }}
        />
        {error && (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>
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
            className="cc-btn cc-btn-danger cc-btn-sm"
            onClick={handleWalkAway}
            disabled={loading}
          >
            Walk Away
          </button>
          <button
            type="button"
            className="cc-btn cc-btn-primary cc-btn-sm"
            onClick={handlePropose}
            disabled={loading || !summary.trim()}
          >
            Propose Resolution
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Main Component ---------- */

function JointChatViewInner({
  caseId,
}: {
  caseId: Id<"cases">;
}): React.ReactElement {
  const solo = useSoloActingParty(caseId);

  const queryArgs = solo.isSolo
    ? { caseId, viewAsRole: solo.actingRole }
    : { caseId };

  const caseDoc = useQuery(api.cases.get, { caseId });
  const jointMessages = useQuery(api.jointChat.messages, queryArgs);
  const synthesis = useQuery(api.jointChat.mySynthesis, queryArgs);

  const sendUserMessage = useMutation(api.jointChat.sendUserMessage);
  const proposeClosure = useMutation(api.jointChat.proposeClosure);
  const unilateralClose = useMutation(api.jointChat.unilateralClose);

  const [synthesisOpen, setSynthesisOpen] = React.useState(false);
  const [closureOpen, setClosureOpen] = React.useState(false);
  const [draftCoachOpen, setDraftCoachOpen] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);

  // Loading state
  if (
    caseDoc === undefined ||
    jointMessages === undefined ||
    synthesis === undefined
  ) {
    return <LoadingSpinner />;
  }

  // Route guard: only JOINT_ACTIVE
  if (caseDoc.status !== "JOINT_ACTIVE") {
    return <Navigate to={`/cases/${caseId}`} replace />;
  }

  // Solo mode
  const initiatorLabel = "Initiator";
  const inviteeLabel = "Invitee";
  const activeToggleParty: "initiator" | "invitee" =
    solo.actingRole === "INVITEE" ? "invitee" : "initiator";

  // Check if Coach is currently generating (streaming)
  const isCoachStreaming = jointMessages.some(
    (m) => m.authorType === "COACH" && m.status === "STREAMING",
  );

  // Map joint messages to ChatMessage format
  const messages: ChatMessage[] = jointMessages.map((msg) => {
    let variant: BubbleVariant;
    if (msg.status === "ERROR") {
      variant = "error";
    } else if (msg.authorType === "COACH") {
      variant = msg.isIntervention ? "coach-intervention" : "coach-joint";
    } else {
      // USER message
      variant =
        msg.authorUserId === caseDoc.initiatorUserId
          ? "party-initiator"
          : "party-invitee";
    }

    // Coach streaming messages show placeholder
    const content =
      msg.authorType === "COACH" && msg.status === "STREAMING"
        ? "Coach is thinking..."
        : msg.content;

    // Coach avatar name uses ⟡ glyph
    const authorName = msg.authorType === "COACH" ? "⟡" : undefined;

    return {
      id: msg._id,
      variant,
      status: msg.status,
      content,
      authorName,
      createdAt: msg.createdAt,
    };
  });

  const handleSend = async (text: string) => {
    setSendError(null);
    try {
      await sendUserMessage({
        caseId,
        content: text,
        ...(solo.isSolo ? { viewAsRole: solo.actingRole } : {}),
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      setSendError(
        err instanceof Error ? err.message : "Failed to send message. Please try again.",
      );
    }
  };

  const handleRetry = async () => {
    // Re-send the last user message to trigger Coach re-generation
    const lastUserMsg = [...jointMessages]
      .reverse()
      .find((m) => m.authorType === "USER");
    if (!lastUserMsg) {
      console.warn("handleRetry: no prior user message to re-send");
      return;
    }
    try {
      await sendUserMessage({
        caseId,
        content: lastUserMsg.content,
        ...(solo.isSolo ? { viewAsRole: solo.actingRole } : {}),
      });
    } catch (err) {
      console.error("Failed to retry:", err);
    }
  };

  const handleProposeClosure = async (summary: string) => {
    await proposeClosure({
      caseId,
      summary,
      ...(solo.isSolo ? { viewAsRole: solo.actingRole } : {}),
    });
  };

  const handleUnilateralClose = async () => {
    await unilateralClose({
      caseId,
      ...(solo.isSolo ? { viewAsRole: solo.actingRole } : {}),
    });
  };

  return (
    <main
      data-testid="page-case-joint"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 56px)",
        maxWidth: 800,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Phase header with nav actions */}
      <PhaseHeader caseName={caseDoc.category} phaseName="Joint Session">
        {solo.isSolo && (
          <PartyToggle
            initiatorName={initiatorLabel}
            inviteeName={inviteeLabel}
            activeParty={activeToggleParty}
            onToggle={solo.setActingParty}
          />
        )}
      </PhaseHeader>

      {/* Top nav actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <button
          type="button"
          className="cc-btn cc-btn-ghost cc-btn-sm"
          onClick={() => setSynthesisOpen(true)}
          aria-label="My guidance"
        >
          My guidance
        </button>
        <button
          type="button"
          className="cc-btn cc-btn-ghost cc-btn-sm"
          onClick={() => setClosureOpen(true)}
          aria-label="Close session"
        >
          Close
        </button>
      </div>

      {/* Message list with auto-scroll */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ChatWindow messages={messages} className="cc-joint-chat-messages" onRetry={handleRetry} />
      </div>

      {/* Send error feedback */}
      {sendError && (
        <p style={{ color: "var(--danger)", fontSize: 13, padding: "0 16px", margin: 0 }}>
          {sendError}
        </p>
      )}

      {/* Input area */}
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <MessageInput
              onSend={handleSend}
              isAiResponding={isCoachStreaming}
              placeholder="Type a message..."
              autoFocus
            />
          </div>
          <button
            type="button"
            className="cc-btn cc-btn-ghost cc-btn-sm"
            onClick={() => setDraftCoachOpen(!draftCoachOpen)}
            aria-label="Draft with Coach"
          >
            ✨ Draft with Coach
          </button>
        </div>
      </div>

      {/* Draft Coach mount point (panel built in sibling task) */}
      {draftCoachOpen && <div id="draft-coach-mount" data-testid="draft-coach-mount" />}

      {/* Synthesis side panel */}
      <SynthesisPanel
        open={synthesisOpen}
        onClose={() => setSynthesisOpen(false)}
        text={synthesis?.text ?? null}
      />

      {/* Closure modal */}
      <ClosureModal
        open={closureOpen}
        onOpenChange={setClosureOpen}
        onProposeClosure={handleProposeClosure}
        onUnilateralClose={handleUnilateralClose}
      />
    </main>
  );
}

export function JointChatView(): React.ReactElement {
  const { caseId } = useParams<{ caseId: string }>();

  if (!caseId) {
    return (
      <main data-testid="page-case-joint">
        <p>Invalid case URL.</p>
      </main>
    );
  }

  const typedCaseId = caseId as Id<"cases">;

  return <JointChatViewInner caseId={typedCaseId} />;
}
