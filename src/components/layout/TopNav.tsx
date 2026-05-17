import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface TopNavProps {
  variant: "logged-in" | "case-detail";
  casePhase?: string;
  caseId?: string;
}

export function TopNav({ variant, casePhase, caseId }: TopNavProps) {
  if (variant === "case-detail") {
    return (
      <nav
        className="cc-topnav"
        data-testid="topnav-case-detail"
        aria-label="Case navigation"
      >
        <div className="cc-topnav-inner">
          <Link
            to={caseId ? `/cases/${caseId}` : "/dashboard"}
            className="cc-topnav-back"
            aria-label="Back to case"
          >
            <ArrowLeft size={14} />
          </Link>
          {casePhase && (
            <span className="cc-topnav-phase" data-testid="topnav-phase">
              {casePhase}
            </span>
          )}
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="cc-topnav"
      data-testid="topnav-logged-in"
      aria-label="Main navigation"
    >
      <div className="cc-topnav-inner">
        <Link to="/dashboard" className="cc-topnav-brand">
          Clarity
        </Link>
        <div className="cc-topnav-actions">
          <Link to="/dashboard" data-testid="topnav-dashboard-link">
            Dashboard
          </Link>
          <div className="cc-topnav-user" data-testid="topnav-user-menu">
            Account
          </div>
        </div>
      </div>
    </nav>
  );
}
