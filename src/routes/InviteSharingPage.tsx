import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "../components/ui/button";
import { LoadingSpinner } from "../components/layout/LoadingSpinner";

function useCopyWithFeedback(text: string): { copy: () => void; copied: boolean } {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Clipboard API unavailable — silently fail
    });
  }, [text]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { copy, copied };
}

export function InviteSharingPage(): React.ReactElement {
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const otherPartyName: string =
    (location.state as { otherPartyName?: string } | null)?.otherPartyName || "the other party";

  const caseDoc = useQuery(api.cases.get, { caseId: caseId as Id<"cases"> });
  const partyStates = useQuery(api.cases.partyStates, { caseId: caseId as Id<"cases"> });
  const invite = useQuery(api.invites.getForCase, { caseId: caseId as Id<"cases"> });

  // Solo-mode redirect guard
  useEffect(() => {
    if (caseDoc && caseDoc.isSolo) {
      navigate(`/cases/${caseId}/private`, { replace: true });
    }
  }, [caseDoc, caseId, navigate]);

  const inviteUrl = invite?.url ?? "";
  const mainTopic = partyStates?.self?.mainTopic ?? "our situation";

  // Display name for templates — use "there" for email greeting when fallback
  const templateName = otherPartyName === "the other party" ? "there" : otherPartyName;

  const emailSubject = encodeURIComponent("Let's work through this together — Clarity");
  const emailBody = encodeURIComponent(
    `Hey ${templateName} — I found this thing called Clarity. It's a private tool that helps two people work through something difficult together with an AI mediator. I thought it might help us work through the ${mainTopic}. Here's a link to join: ${inviteUrl}. No pressure — let me know what you think.`,
  );

  const smsText = `Hey ${templateName}, I thought this might help us work through the ${mainTopic}: ${inviteUrl}`;

  const linkCopy = useCopyWithFeedback(inviteUrl);
  const smsCopy = useCopyWithFeedback(smsText);

  const [expandedHelp, setExpandedHelp] = useState(false);

  // Loading state — all three queries must resolve
  if (caseDoc === undefined || partyStates === undefined || invite === undefined) {
    return <LoadingSpinner />;
  }

  // Solo redirect is handled by the useEffect above, but guard rendering too
  if (caseDoc.isSolo) {
    return <LoadingSpinner />;
  }

  // Token already consumed
  if (invite === null) {
    return (
      <main style={{ display: "flex", justifyContent: "center", minHeight: "100vh", padding: "2rem 1rem" }}>
        <div style={{ maxWidth: 600, width: "100%", textAlign: "center" }}>
          <h1>Link already used</h1>
          <p>{otherPartyName === "the other party" ? "The other party" : otherPartyName} has joined the case.</p>
          <Link to={`/cases/${caseId}`}>
            <Button variant="primary" style={{ marginTop: "1rem" }}>Go to case</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: "flex", justifyContent: "center", minHeight: "100vh", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 600, width: "100%" }}>
        <h1>Your case is ready. Send this link to {otherPartyName}.</h1>

        {/* Invite link monospace field */}
        <div
          className="font-mono"
          style={{
            padding: "1rem",
            background: "var(--surface-secondary, #f5f5f5)",
            borderRadius: "0.5rem",
            fontSize: "1.125rem",
            wordBreak: "break-all",
            marginBottom: "1rem",
            border: "1px solid var(--border-default, #ddd)",
          }}
          data-testid="invite-url-field"
        >
          {inviteUrl}
        </div>

        {/* Primary copy button */}
        <Button
          variant="primary"
          onClick={linkCopy.copy}
          style={{ width: "100%", marginBottom: "1.5rem" }}
          aria-live="polite"
        >
          {linkCopy.copied ? "Copied!" : "Copy link"}
        </Button>

        {/* Share options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <a
            href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
            style={{ textDecoration: "none" }}
          >
            <Button variant="secondary" style={{ width: "100%" }}>
              Copy for email
            </Button>
          </a>

          <Button variant="secondary" onClick={smsCopy.copy} style={{ width: "100%" }}>
            Copy for text
          </Button>

          <Button variant="secondary" onClick={linkCopy.copy} style={{ width: "100%" }}>
            Just copy the link
          </Button>
        </div>

        {/* Expandable suggested language section */}
        <div style={{ marginBottom: "1.5rem" }}>
          <button
            type="button"
            onClick={() => setExpandedHelp(!expandedHelp)}
            aria-expanded={expandedHelp}
            style={{
              cursor: "pointer",
              fontWeight: 600,
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
            }}
          >
            What should I tell them?
          </button>
          {expandedHelp && (
            <div style={{ marginTop: "0.75rem", padding: "1rem", background: "var(--surface-secondary, #f5f5f5)", borderRadius: "0.5rem" }}>
              <p style={{ fontStyle: "italic", marginBottom: "0.5rem" }}>
                {`"Hey ${templateName} — I found this thing called Clarity. It's a private tool that helps two people work through something difficult together with an AI mediator. I thought it might help us work through the ${mainTopic}. Here's a link to join: ${inviteUrl}. No pressure — let me know what you think."`}
              </p>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                Feel free to adjust this message to fit your style and situation.
              </p>
            </div>
          )}
        </div>

        {/* Secondary CTA */}
        <div style={{ textAlign: "center" }}>
          <Link to={`/cases/${caseId}/private`} style={{ fontWeight: 500 }}>
            Or, start your private coaching now →
          </Link>
        </div>
      </div>
    </main>
  );
}
