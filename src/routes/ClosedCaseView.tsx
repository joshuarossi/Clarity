import * as React from "react";
import { useParams, useSearchParams, Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ChatWindow } from "../components/chat/ChatWindow";
import type { ChatMessage } from "../components/chat/MessageBubble";
import type { BubbleVariant } from "../components/chat/MessageBubble";
import { LoadingSpinner } from "../components/layout/LoadingSpinner";
import { PhaseHeader } from "../components/layout/PhaseHeader";
import { PartyToggle } from "../components/layout/PartyToggle";
import { useSoloActingParty } from "../hooks/useSoloActingParty";

/* ---------- Pure helpers ---------- */

function statusToOutcome(
  status: "CLOSED_RESOLVED" | "CLOSED_UNRESOLVED" | "CLOSED_ABANDONED",
): string {
  switch (status) {
    case "CLOSED_RESOLVED":
      return "Resolved";
    case "CLOSED_UNRESOLVED":
      return "Not Resolved";
    case "CLOSED_ABANDONED":
      return "Abandoned";
  }
}

type TabId = "joint" | "private" | "guidance";

function isValidTab(value: string | null): value is TabId {
  return value === "joint" || value === "private" || value === "guidance";
}

/* ---------- Inner component ---------- */

function ClosedCaseViewInner({
  caseId,
}: {
  caseId: Id<"cases">;
}): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const solo = useSoloActingParty(caseId);

  const tabParam = searchParams.get("tab");
  const activeTab: TabId = isValidTab(tabParam) ? tabParam : "joint";

  const queryArgs = solo.isSolo
    ? { caseId, viewAsRole: solo.actingRole }
    : { caseId };

  const caseDoc = useQuery(api.cases.get, { caseId });
  const partyStates = useQuery(api.cases.partyStates, queryArgs);
  const jointMessages = useQuery(api.jointChat.messages, queryArgs);
  const privateMessages = useQuery(
    api.privateCoaching.myMessages,
    activeTab === "private"
      ? { caseId, partyRole: solo.isSolo ? solo.actingRole : undefined }
      : "skip",
  );
  const synthesis = useQuery(api.jointChat.mySynthesis, queryArgs);

  // Loading state
  if (
    caseDoc === undefined ||
    partyStates === undefined ||
    jointMessages === undefined
  ) {
    return <LoadingSpinner />;
  }

  // Route guard: only closed statuses
  if (
    caseDoc.status !== "CLOSED_RESOLVED" &&
    caseDoc.status !== "CLOSED_UNRESOLVED" &&
    caseDoc.status !== "CLOSED_ABANDONED"
  ) {
    return <Navigate to={`/cases/${caseId}`} replace />;
  }

  const outcome = statusToOutcome(caseDoc.status);
  const closureDate = caseDoc.closedAt
    ? new Date(caseDoc.closedAt).toLocaleDateString()
    : "";

  // Solo mode
  const initiatorLabel = "Initiator";
  const inviteeLabel = "Invitee";
  const activeToggleParty: "initiator" | "invitee" =
    solo.actingRole === "INVITEE" ? "invitee" : "initiator";

  const setTab = (tab: TabId) => {
    setSearchParams({ tab }, { replace: true });
  };

  // Map joint messages to ChatMessage format
  const jointChatMessages: ChatMessage[] = jointMessages.map((msg) => {
    let variant: BubbleVariant;
    if (msg.status === "ERROR") {
      variant = "error";
    } else if (msg.authorType === "COACH") {
      variant = msg.isIntervention ? "coach-intervention" : "coach-joint";
    } else {
      variant =
        msg.authorUserId === caseDoc.initiatorUserId
          ? "party-initiator"
          : "party-invitee";
    }

    const authorName = msg.authorType === "COACH" ? "⟡" : undefined;

    return {
      id: msg._id,
      variant,
      status: msg.status,
      content: msg.content,
      authorName,
      createdAt: msg.createdAt,
    };
  });

  // Map private coaching messages
  const privateChatMessages: ChatMessage[] = (privateMessages ?? []).map(
    (msg) => ({
      id: msg._id,
      variant: (msg.role === "USER" ? "user" : "coach") as BubbleVariant,
      status: msg.status,
      content: msg.content,
      createdAt: msg.createdAt,
    }),
  );

  // Keyboard navigation for tabs
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const tabs: TabId[] = ["joint", "private", "guidance"];
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex: number | null = null;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      setTab(tabs[nextIndex]);
      const nextButton = document.querySelector(
        `[data-testid="tab-${tabs[nextIndex]}"]`,
      ) as HTMLElement | null;
      nextButton?.focus();
    }
  };

  return (
    <main
      data-testid="page-case-closed"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 56px)",
        maxWidth: 800,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <PhaseHeader caseName={caseDoc.category} phaseName="Closed">
        {solo.isSolo && (
          <PartyToggle
            initiatorName={initiatorLabel}
            inviteeName={inviteeLabel}
            activeParty={activeToggleParty}
            onToggle={solo.setActingParty}
          />
        )}
      </PhaseHeader>

      {/* Header section */}
      <div style={{ padding: "16px" }}>
        <h2>{caseDoc.category}</h2>
        <p data-testid="closed-header-closure-date">{closureDate}</p>
        <p data-testid="closed-header-outcome">{outcome}</p>
      </div>

      {/* Closure summary (only when resolved) */}
      {caseDoc.status === "CLOSED_RESOLVED" && caseDoc.closureSummary && (
        <div
          data-testid="closed-closure-summary"
          style={{
            padding: "12px 16px",
            margin: "0 16px 16px",
            backgroundColor: "var(--surface-success, #f0fdf4)",
            borderRadius: 8,
            border: "1px solid var(--border-success, #bbf7d0)",
          }}
        >
          <strong>Resolution Summary</strong>
          <p style={{ margin: "8px 0 0" }}>{caseDoc.closureSummary}</p>
        </div>
      )}

      {/* Closed banner */}
      <div
        data-testid="closed-banner"
        role="status"
        style={{
          padding: "12px 16px",
          margin: "0 16px 16px",
          backgroundColor: "var(--surface-muted, #f5f5f5)",
          borderRadius: 8,
          textAlign: "center",
        }}
      >
        This case is closed. No new messages can be added.
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Case sections"
        style={{ padding: "0 16px" }}
      >
        <button
          role="tab"
          id="tab-joint"
          data-testid="tab-joint"
          aria-selected={activeTab === "joint"}
          aria-controls="tabpanel-joint"
          tabIndex={activeTab === "joint" ? 0 : -1}
          onClick={() => setTab("joint")}
          onKeyDown={handleTabKeyDown}
          className={`cc-btn cc-btn-sm ${activeTab === "joint" ? "cc-btn-primary" : "cc-btn-ghost"}`}
        >
          Joint Chat
        </button>
        <button
          role="tab"
          id="tab-private"
          data-testid="tab-private"
          aria-selected={activeTab === "private"}
          aria-controls="tabpanel-private"
          tabIndex={activeTab === "private" ? 0 : -1}
          onClick={() => setTab("private")}
          onKeyDown={handleTabKeyDown}
          className={`cc-btn cc-btn-sm ${activeTab === "private" ? "cc-btn-primary" : "cc-btn-ghost"}`}
        >
          My Private Coaching
        </button>
        <button
          role="tab"
          id="tab-guidance"
          data-testid="tab-guidance"
          aria-selected={activeTab === "guidance"}
          aria-controls="tabpanel-guidance"
          tabIndex={activeTab === "guidance" ? 0 : -1}
          onClick={() => setTab("guidance")}
          onKeyDown={handleTabKeyDown}
          className={`cc-btn cc-btn-sm ${activeTab === "guidance" ? "cc-btn-primary" : "cc-btn-ghost"}`}
        >
          My Guidance
        </button>
      </div>

      {/* Tab panels */}
      {activeTab === "joint" && (
        <div
          role="tabpanel"
          id="tabpanel-joint"
          data-testid="tabpanel-joint"
          aria-labelledby="tab-joint"
          style={{ flex: 1, overflow: "hidden" }}
        >
          <ChatWindow messages={jointChatMessages} />
        </div>
      )}

      {activeTab === "private" && (
        <div
          role="tabpanel"
          id="tabpanel-private"
          data-testid="tabpanel-private"
          aria-labelledby="tab-private"
          style={{ flex: 1, overflow: "hidden" }}
        >
          {privateMessages === undefined ? (
            <LoadingSpinner />
          ) : (
            <ChatWindow messages={privateChatMessages} />
          )}
        </div>
      )}

      {activeTab === "guidance" && (
        <div
          role="tabpanel"
          id="tabpanel-guidance"
          data-testid="tabpanel-guidance"
          aria-labelledby="tab-guidance"
          style={{ flex: 1, overflow: "hidden", padding: 16 }}
        >
          {synthesis === undefined ? (
            <LoadingSpinner />
          ) : synthesis === null ? (
            <p>Synthesis not available.</p>
          ) : (
            <p>{synthesis.text}</p>
          )}
        </div>
      )}
    </main>
  );
}

/* ---------- Top-level export ---------- */

export function ClosedCaseView(): React.ReactElement {
  const { caseId } = useParams<{ caseId: string }>();

  if (!caseId) {
    return (
      <main data-testid="page-case-closed">
        <p>Invalid case URL.</p>
      </main>
    );
  }

  const typedCaseId = caseId as Id<"cases">;

  return <ClosedCaseViewInner caseId={typedCaseId} />;
}
