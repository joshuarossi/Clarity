import * as React from "react";

interface ClosureConfirmBannerProps {
  summary: string;
  proposerName: string;
  onConfirm: () => void;
  onReject: () => void;
}

export function ClosureConfirmBanner({
  summary,
  proposerName,
  onConfirm,
  onReject,
}: ClosureConfirmBannerProps): React.ReactElement {
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: "12px 16px",
        margin: "0 16px 8px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>
        📬 {proposerName} has proposed resolving this case.
      </p>
      <blockquote
        style={{
          margin: "8px 0",
          paddingLeft: 12,
          borderLeft: "3px solid var(--border-default)",
          color: "var(--text-secondary)",
          fontStyle: "italic",
        }}
      >
        {summary}
      </blockquote>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          ref={confirmRef}
          type="button"
          className="cc-btn cc-btn-primary cc-btn-sm"
          onClick={onConfirm}
        >
          Confirm
        </button>
        <button
          type="button"
          className="cc-btn cc-btn-ghost cc-btn-sm"
          onClick={onReject}
        >
          Reject and keep talking
        </button>
      </div>
    </div>
  );
}
