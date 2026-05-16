import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/ui/button";
import { LoadingSpinner } from "../components/layout/LoadingSpinner";
import { handleConvexError } from "../lib/errorHandler";

export function InviteAcceptPage(): React.ReactElement {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const invite = useQuery(api.invites.getByToken, token ? { token } : "skip");
  const redeemMutation = useMutation(api.invites.redeem);
  const declineMutation = useMutation(api.invites.decline);

  const [error, setError] = useState<string | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);

  // Loading state — wait for auth and query to resolve
  if (authLoading || invite === undefined) {
    return <LoadingSpinner />;
  }

  // Invalid token — no record found
  if (invite === null) {
    return (
      <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "2rem 1rem" }}>
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <h1>This invite link is not valid.</h1>
          <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>
            The link may have expired or been entered incorrectly.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            {isAuthenticated ? (
              <Link to="/dashboard">
                <Button variant="primary">Go to dashboard</Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button variant="primary">Sign in</Button>
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Consumed token
  if (invite.status === "CONSUMED") {
    return (
      <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "2rem 1rem" }}>
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <h1>This invite has already been accepted.</h1>
          <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>
            This invite link has already been used.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            {isAuthenticated ? (
              <Link to="/dashboard">
                <Button variant="primary">Go to dashboard</Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button variant="primary">Sign in</Button>
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ACTIVE token — logged-out view
  if (!isAuthenticated) {
    return (
      <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "2rem 1rem" }}>
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <h1>{invite.initiatorName} has invited you to work through something together</h1>
          <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>
            Clarity is a private mediation tool. You'll each talk with an AI coach privately before having a facilitated conversation together.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link to={`/login?redirect=/invite/${token}`}>
              <Button variant="primary">Sign in to continue</Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ACTIVE token — logged-in unredeemed view
  const handleAccept = async () => {
    if (!token) return;
    setError(null);
    setAcceptLoading(true);
    try {
      const result = await redeemMutation({ token });
      navigate(`/cases/${result.caseId}/private`);
    } catch (err) {
      const { message } = handleConvexError(err);
      setError(message);
    } finally {
      setAcceptLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    setError(null);
    setDeclineLoading(true);
    try {
      await declineMutation({ token });
      navigate("/dashboard");
    } catch (err) {
      const { message } = handleConvexError(err);
      setError(message);
    } finally {
      setDeclineLoading(false);
    }
  };

  return (
    <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <h1 style={{ textAlign: "center" }}>
          {invite.initiatorName} has invited you to work through something together
        </h1>

        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "var(--surface-secondary, #f5f5f5)", borderRadius: "0.5rem" }}>
          <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{invite.category}</p>
          <p>{invite.mainTopic}</p>
        </div>

        <p style={{ marginTop: "1rem", fontStyle: "italic", color: "var(--text-secondary)" }}>
          {invite.initiatorName} wrote this in the shared summary. You'll have your own private space to share your perspective.
        </p>

        {error && (
          <p role="alert" style={{ marginTop: "1rem", color: "var(--text-error, #dc2626)" }}>
            {error}
          </p>
        )}

        <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Button
            variant="primary"
            onClick={handleAccept}
            disabled={acceptLoading || declineLoading}
            style={{ width: "100%" }}
          >
            {acceptLoading ? "Accepting..." : "Accept invitation"}
          </Button>
          <Button
            variant="danger"
            onClick={handleDecline}
            disabled={acceptLoading || declineLoading}
            style={{ width: "100%" }}
          >
            {declineLoading ? "Declining..." : "Decline"}
          </Button>
        </div>
      </div>
    </main>
  );
}
