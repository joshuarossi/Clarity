import { useConvexAuth } from "convex/react";
import { useLocation, useParams, Link } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser";

export default function TopNav() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useCurrentUser();
  const location = useLocation();
  const params = useParams();

  const isCaseDetail = Boolean(
    params.caseId && location.pathname.startsWith("/cases/"),
  );

  if (!isAuthenticated) {
    return (
      <nav aria-label="Main navigation">
        <div style={{ display: "flex", alignItems: "center", padding: "1rem" }}>
          <Link to="/" style={{ fontWeight: 600, textDecoration: "none" }}>
            Clarity
          </Link>
        </div>
      </nav>
    );
  }

  if (isCaseDetail) {
    return (
      <nav aria-label="Case navigation" data-testid="topnav-case-detail">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "1rem",
            gap: "1rem",
          }}
        >
          <Link
            to="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              textDecoration: "none",
            }}
            data-testid="back-to-dashboard"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Dashboard
          </Link>
          <span data-testid="case-phase" style={{ marginLeft: "auto" }}>
            Loading...
          </span>
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Main navigation" data-testid="topnav-logged-in">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem",
        }}
      >
        <Link to="/" style={{ fontWeight: 600, textDecoration: "none" }}>
          Clarity
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link to="/dashboard">Dashboard</Link>
          <span data-testid="user-menu">
            {user?.displayName || user?.email || "User"}
          </span>
        </div>
      </div>
    </nav>
  );
}
