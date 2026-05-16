import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "../components/ui/button";
import { PartyAvatar } from "../components/ui/PartyAvatar";
import { StatusPill } from "../components/ui/StatusPill";

interface CaseRowProps {
  caseId: Id<"cases">;
  otherPartyName: string | null;
  otherPartyRole: "initiator" | "invitee";
  category: string;
  createdAt: number;
  updatedAt: number;
  statusVariant: "pill-turn" | "pill-waiting" | "pill-ready" | "pill-closed";
  statusLabel: string;
  isSolo: boolean;
  onClick: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

function CaseRow({
  caseId,
  otherPartyName,
  otherPartyRole,
  category,
  createdAt,
  updatedAt,
  statusVariant,
  statusLabel,
  isSolo,
  onClick,
}: CaseRowProps): React.ReactElement {
  const displayName = otherPartyName ?? "Waiting for invite";

  return (
    <div
      role="link"
      tabIndex={0}
      data-testid={`case-row-${caseId}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "0.5rem",
        border: "1px solid var(--border-default)",
        cursor: "pointer",
        marginBottom: "0.5rem",
      }}
    >
      <PartyAvatar
        role={otherPartyRole}
        name={otherPartyName ?? "?"}
        size="md"
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontWeight: 600 }}>{displayName}</span>
          {isSolo && (
            <span
              data-testid="solo-badge"
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "0.125rem 0.375rem",
                borderRadius: "0.25rem",
                background: "var(--accent-subtle, #e0e7ff)",
                color: "var(--accent, #4f46e5)",
              }}
            >
              Solo
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            display: "flex",
            gap: "0.5rem",
          }}
        >
          <span>{category}</span>
          <span aria-hidden="true">&middot;</span>
          <span>Created {formatDate(createdAt)}</span>
        </div>
      </div>

      <StatusPill variant={statusVariant} label={statusLabel} />

      <span
        style={{
          fontSize: "0.75rem",
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        {formatRelativeTime(updatedAt)}
      </span>

      <Button variant="secondary" size="sm" tabIndex={-1}>
        Enter
      </Button>
    </div>
  );
}

function CaseRowSkeleton(): React.ReactElement {
  return (
    <div
      data-testid="case-row-skeleton"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "0.5rem",
        border: "1px solid var(--border-default)",
        marginBottom: "0.5rem",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "var(--skeleton-bg, #e5e7eb)",
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            width: "60%",
            height: 14,
            borderRadius: 4,
            background: "var(--skeleton-bg, #e5e7eb)",
            marginBottom: 6,
          }}
        />
        <div
          style={{
            width: "40%",
            height: 12,
            borderRadius: 4,
            background: "var(--skeleton-bg, #e5e7eb)",
          }}
        />
      </div>
      <div
        style={{
          width: 60,
          height: 20,
          borderRadius: 10,
          background: "var(--skeleton-bg, #e5e7eb)",
        }}
      />
    </div>
  );
}

export function DashboardPage(): React.ReactElement {
  const navigate = useNavigate();
  const cases = useQuery(api.cases.listForDashboard);

  // Loading state
  if (cases === undefined) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h1>Dashboard</h1>
          <Button variant="primary" onClick={() => navigate("/cases/new")}>
            + New Case
          </Button>
        </div>
        <CaseRowSkeleton />
        <CaseRowSkeleton />
        <CaseRowSkeleton />
      </main>
    );
  }

  // Empty state
  if (cases.length === 0) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h1>Dashboard</h1>
          <Button variant="primary" onClick={() => navigate("/cases/new")}>
            + New Case
          </Button>
        </div>
        <p style={{ color: "var(--text-secondary)", marginTop: "2rem" }}>
          No cases yet. When you&apos;re ready to work through something, start
          a new case.
        </p>
      </main>
    );
  }

  const activeCases = cases.filter(
    (c) =>
      c.status !== "CLOSED_RESOLVED" &&
      c.status !== "CLOSED_UNRESOLVED" &&
      c.status !== "CLOSED_ABANDONED",
  );
  const closedCases = cases.filter(
    (c) =>
      c.status === "CLOSED_RESOLVED" ||
      c.status === "CLOSED_UNRESOLVED" ||
      c.status === "CLOSED_ABANDONED",
  );

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1>Dashboard</h1>
        <Button variant="primary" onClick={() => navigate("/cases/new")}>
          + New Case
        </Button>
      </div>

      {/* Active Cases */}
      <section aria-label="Active Cases" style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.75rem" }}>
          Active Cases
        </h2>
        {activeCases.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>No active cases</p>
        ) : (
          activeCases.map((c) => (
            <CaseRow
              key={c._id}
              caseId={c._id}
              otherPartyName={c.otherPartyName}
              otherPartyRole={c.otherPartyRole}
              category={c.category}
              createdAt={c.createdAt}
              updatedAt={c.updatedAt}
              statusVariant={c.statusVariant}
              statusLabel={c.statusLabel}
              isSolo={c.isSolo}
              onClick={() => navigate(`/cases/${c._id}`)}
            />
          ))
        )}
      </section>

      {/* Closed Cases — collapsed by default */}
      {closedCases.length > 0 && (
        <details>
          <summary
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: "0.75rem",
            }}
          >
            Closed Cases ({closedCases.length})
          </summary>
          {closedCases.map((c) => (
            <CaseRow
              key={c._id}
              caseId={c._id}
              otherPartyName={c.otherPartyName}
              otherPartyRole={c.otherPartyRole}
              category={c.category}
              createdAt={c.createdAt}
              updatedAt={c.updatedAt}
              statusVariant={c.statusVariant}
              statusLabel={c.statusLabel}
              isSolo={c.isSolo}
              onClick={() => navigate(`/cases/${c._id}`)}
            />
          ))}
        </details>
      )}
    </main>
  );
}
