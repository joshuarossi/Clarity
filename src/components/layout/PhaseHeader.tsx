import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface PhaseHeaderProps {
  caseName: string;
  phaseName: string;
  backTo?: string;
  children?: React.ReactNode;
}

export function PhaseHeader({
  caseName,
  phaseName,
  backTo = "/dashboard",
  children,
}: PhaseHeaderProps): React.ReactElement {
  return (
    <header className="cc-phase-header">
      <div className="cc-phase-header-left">
        <Link to={backTo} aria-label="Back to Dashboard" className="cc-phase-header-back">
          <ArrowLeft size={14} />
        </Link>
        <Link to={backTo} className="cc-phase-header-back-text">
          Dashboard
        </Link>
      </div>
      <div className="cc-phase-header-center">
        <h1 className="cc-phase-header-title">
          {caseName}
          <span className="cc-phase-header-separator"> · </span>
          {phaseName}
        </h1>
      </div>
      <div className="cc-phase-header-right">
        {children}
      </div>
    </header>
  );
}
