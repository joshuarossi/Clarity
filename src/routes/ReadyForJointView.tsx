import * as React from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PrivacyBanner } from "../components/ui/PrivacyBanner";
import { LoadingSpinner } from "../components/layout/LoadingSpinner";
import { PhaseHeader } from "../components/layout/PhaseHeader";
import { PartyToggle } from "../components/layout/PartyToggle";
import { useSoloActingParty } from "../hooks/useSoloActingParty";
import { MarkdownContent } from "../components/chat/MarkdownContent";

function ReadyForJointViewInner({
  caseId,
}: {
  caseId: Id<"cases">;
}): React.ReactElement {
  const solo = useSoloActingParty(caseId);
  const navigate = useNavigate();

  const queryArgs = solo.isSolo
    ? { caseId, viewAsRole: solo.actingRole }
    : { caseId };

  const caseDoc = useQuery(api.cases.get, { caseId });
  const synthesis = useQuery(api.jointChat.mySynthesis, queryArgs);
  const otherPartyNameResult = useQuery(api.cases.otherPartyName, { caseId });

  const enterSession = useMutation(api.jointChat.enterSession);

  const [entering, setEntering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Loading state — all data must be present
  if (
    caseDoc === undefined ||
    synthesis === undefined ||
    otherPartyNameResult === undefined
  ) {
    return <LoadingSpinner />;
  }

  // Guard: only show for READY_FOR_JOINT
  if (caseDoc.status !== "READY_FOR_JOINT") {
    return <Navigate to={`/cases/${caseId}`} replace />;
  }

  const otherName = otherPartyNameResult?.displayName ?? "the other party";

  // Solo mode toggle
  const initiatorLabel = "Initiator";
  const inviteeLabel = "Invitee";
  const activeToggleParty: "initiator" | "invitee" =
    solo.actingRole === "INVITEE" ? "invitee" : "initiator";

  const handleEnterSession = async () => {
    setEntering(true);
    setError(null);
    try {
      await enterSession(
        solo.isSolo ? { caseId, viewAsRole: solo.actingRole } : { caseId },
      );
      navigate(`/cases/${caseId}/joint`);
    } catch (err) {
      console.error("Failed to enter joint session:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to enter session. Please try again.",
      );
      setEntering(false);
    }
  };

  return (
    <main
      data-testid="page-ready-for-joint"
      style={{
        display: "flex",
        flexDirection: "column",
        maxWidth: 800,
        margin: "0 auto",
        width: "100%",
        padding: 16,
      }}
    >
      {/* Phase header with solo toggle */}
      <PhaseHeader
        caseName={caseDoc.category}
        phaseName="Ready for Joint Session"
      >
        {solo.isSolo && (
          <PartyToggle
            initiatorName={initiatorLabel}
            inviteeName={inviteeLabel}
            activeParty={activeToggleParty}
            onToggle={solo.setActingParty}
          />
        )}
      </PhaseHeader>

      {/* Intro paragraph */}
      <p style={{ marginBottom: 16, color: "var(--text-secondary)" }}>
        You've both completed private coaching. Here's what the Coach has
        prepared for you before the joint session:
      </p>

      {/* Privacy banner + synthesis card (joined borders) */}
      <PrivacyBanner
        copy={`🔒 Private to you — ${otherName} has their own version`}
        className="cc-synthesis-banner"
      />

      {synthesis ? (
        <div className="cc-synthesis-card">
          <MarkdownContent content={synthesis.text} />
        </div>
      ) : (
        <div
          className="cc-synthesis-card"
          style={{ textAlign: "center", color: "var(--text-secondary)" }}
        >
          <p>Your synthesis is being prepared…</p>
          <LoadingSpinner />
        </div>
      )}

      {/* Transition prompt */}
      <p
        style={{
          marginTop: 24,
          marginBottom: 16,
          color: "var(--text-secondary)",
        }}
      >
        Take your time reading this. When you're ready:
      </p>

      {/* Primary CTA */}
      <button
        type="button"
        className="cc-btn cc-btn-primary cc-btn-lg"
        onClick={handleEnterSession}
        disabled={entering}
        style={{ alignSelf: "center" }}
      >
        {entering ? "Entering…" : "Enter Joint Session →"}
      </button>

      {error && (
        <p
          role="alert"
          style={{
            color: "var(--text-error, #dc2626)",
            fontSize: "0.875rem",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          {error}
        </p>
      )}

      {/* Below-CTA message */}
      <p
        style={{
          marginTop: 12,
          textAlign: "center",
          color: "var(--text-secondary)",
          fontSize: "0.875rem",
        }}
      >
        {otherName} will see you've entered when they enter too.
      </p>
    </main>
  );
}

export function ReadyForJointView(): React.ReactElement {
  const { caseId } = useParams<{ caseId: string }>();

  if (!caseId) {
    return (
      <main data-testid="page-ready-for-joint">
        <p>Invalid case URL.</p>
      </main>
    );
  }

  const typedCaseId = caseId as Id<"cases">;

  return <ReadyForJointViewInner caseId={typedCaseId} />;
}
