import * as React from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingSpinner } from "../components/layout/LoadingSpinner";
import { PhaseHeader } from "../components/layout/PhaseHeader";
import { PartyToggle } from "../components/layout/PartyToggle";
import { useSoloActingParty } from "../hooks/useSoloActingParty";
import { handleConvexError } from "../lib/errorHandler";
import type { CaseStatus } from "../../convex/lib/stateMachine";

/* ---------- Pure helpers ---------- */

function statusToPhase(status: CaseStatus): { phaseName: string; subroute: string } {
  switch (status) {
    case "DRAFT_PRIVATE_COACHING":
    case "BOTH_PRIVATE_COACHING":
      return { phaseName: "Private Coaching", subroute: "private" };
    case "READY_FOR_JOINT":
      return { phaseName: "Ready for Joint Session", subroute: "ready" };
    case "JOINT_ACTIVE":
      return { phaseName: "Joint Discussion", subroute: "joint" };
    case "CLOSED_RESOLVED":
    case "CLOSED_UNRESOLVED":
    case "CLOSED_ABANDONED":
      return { phaseName: "Closed", subroute: "closed" };
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled case status: ${_exhaustive}`);
    }
  }
}

/* ---------- Placeholder subviews ---------- */

function JointChatView() {
  return (
    <div data-testid="subview-joint-chat">
      <h2>Joint Session Active</h2>
      <p>The joint discussion is in progress.</p>
    </div>
  );
}

function ClosedCaseView() {
  return (
    <div data-testid="subview-closed">
      <h2>Case Closed</h2>
      <p>This case has been closed.</p>
    </div>
  );
}

/* ---------- Invitee form ---------- */

function InviteeFormView({
  caseId,
  category,
}: {
  caseId: Id<"cases">;
  category: string;
}) {
  const updateMyForm = useMutation(api.cases.updateMyForm);
  const [mainTopic, setMainTopic] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [desiredOutcome, setDesiredOutcome] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isValid = mainTopic.trim() !== "" && description.trim() !== "" && desiredOutcome.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateMyForm({
        caseId,
        mainTopic: mainTopic.trim(),
        description: description.trim(),
        desiredOutcome: desiredOutcome.trim(),
      });
    } catch (err) {
      console.error("Failed to submit perspective form:", err);
      setError(handleConvexError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="invitee-form">
      <h2>Share Your Perspective</h2>
      <p>Category: {category}</p>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          <label>
            <span>Main Topic</span>
            <input
              type="text"
              data-testid="invitee-form-main-topic"
              value={mainTopic}
              onChange={(e) => setMainTopic(e.target.value)}
              required
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              data-testid="invitee-form-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <label>
            <span>Desired Outcome</span>
            <textarea
              data-testid="invitee-form-desired-outcome"
              value={desiredOutcome}
              onChange={(e) => setDesiredOutcome(e.target.value)}
              required
              rows={3}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          {error && (
            <p role="alert" style={{ color: "var(--text-error, #dc2626)", fontSize: "0.875rem" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className="cc-btn cc-btn-primary"
            disabled={!isValid || submitting}
          >
            {submitting ? "Submitting…" : "Submit Perspective"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Error boundary for auth/access errors ---------- */

function ForbiddenRedirect() {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate("/dashboard", {
      state: { error: "You do not have access to that case." },
    });
  }, [navigate]);
  return null;
}

class CaseErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    if (err instanceof ConvexError) {
      const code = (err.data as Record<string, unknown>)?.code;
      if (code === "FORBIDDEN" || code === "NOT_FOUND") {
        return { error: String(code) };
      }
    }
    if (err.message === "FORBIDDEN" || err.message === "NOT_FOUND") {
      return { error: err.message };
    }
    throw err;
  }

  render() {
    if (this.state.error) {
      return <ForbiddenRedirect />;
    }
    return this.props.children;
  }
}

/* ---------- Inner orchestrator ---------- */

function CaseDetailInner({ caseId }: { caseId: Id<"cases"> }): React.ReactElement {
  const solo = useSoloActingParty(caseId);
  const caseDoc = useQuery(api.cases.get, { caseId });

  const partyStatesArgs = solo.isSolo
    ? { caseId, viewAsRole: solo.actingRole }
    : { caseId };
  const partyStates = useQuery(api.cases.partyStates, partyStatesArgs);

  const headingRef = React.useRef<HTMLElement>(null);
  const prevStatusRef = React.useRef<string | undefined>(undefined);

  // FORBIDDEN / NOT_FOUND errors from useQuery propagate as thrown errors.
  // CaseErrorBoundary (above) catches these and redirects to /dashboard.

  const currentStatus = caseDoc?.status;

  // Focus management on phase transitions (NFR-A11Y)
  React.useEffect(() => {
    if (caseDoc && prevStatusRef.current && prevStatusRef.current !== caseDoc.status) {
      headingRef.current?.focus();
    }
    if (caseDoc) {
      prevStatusRef.current = caseDoc.status;
    }
  }, [currentStatus]);

  // Loading state
  if (caseDoc === undefined || partyStates === undefined) {
    return <LoadingSpinner />;
  }

  const status = caseDoc.status as CaseStatus;
  const { phaseName } = statusToPhase(status);

  // Determine if current user is the invitee and hasn't completed the form
  const isInvitee = partyStates.self.role === "INVITEE";
  const formNotCompleted = !partyStates.self.formCompletedAt;
  const isPrivateCoachingStatus =
    status === "DRAFT_PRIVATE_COACHING" || status === "BOTH_PRIVATE_COACHING";

  const showInviteeForm = isInvitee && formNotCompleted && isPrivateCoachingStatus;

  // Solo mode toggle labels
  const initiatorLabel = "Initiator";
  const inviteeLabel = "Invitee";
  const activeToggleParty: "initiator" | "invitee" =
    solo.actingRole === "INVITEE" ? "invitee" : "initiator";

  const renderSubview = () => {
    if (showInviteeForm) {
      return <InviteeFormView caseId={caseId} category={caseDoc.category} />;
    }

    switch (status) {
      case "DRAFT_PRIVATE_COACHING":
      case "BOTH_PRIVATE_COACHING":
        return <Navigate to={`/cases/${caseId}/private`} replace />;
      case "READY_FOR_JOINT":
        return (
          <div data-testid="subview-ready-for-joint">
            <Navigate to={`/cases/${caseId}/ready`} replace />
          </div>
        );
      case "JOINT_ACTIVE":
        return <JointChatView />;
      case "CLOSED_RESOLVED":
      case "CLOSED_UNRESOLVED":
      case "CLOSED_ABANDONED":
        return <ClosedCaseView />;
      default:
        return <p>Unknown case status.</p>;
    }
  };

  return (
    <main data-testid="page-case-detail" ref={headingRef} tabIndex={-1}>
      <PhaseHeader caseName={caseDoc.category} phaseName={phaseName}>
        {solo.isSolo && (
          <PartyToggle
            initiatorName={initiatorLabel}
            inviteeName={inviteeLabel}
            activeParty={activeToggleParty}
            onToggle={solo.setActingParty}
          />
        )}
      </PhaseHeader>
      {renderSubview()}
    </main>
  );
}

/* ---------- Top-level export ---------- */

export function CaseDetailPage(): React.ReactElement {
  const { caseId } = useParams<{ caseId: string }>();

  if (!caseId) {
    return (
      <main data-testid="page-case-detail">
        <p>Invalid case URL.</p>
      </main>
    );
  }

  const typedCaseId = caseId as Id<"cases">;

  return (
    <CaseErrorBoundary>
      <CaseDetailInner caseId={typedCaseId} />
    </CaseErrorBoundary>
  );
}
