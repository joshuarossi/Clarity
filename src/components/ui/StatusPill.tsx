import * as React from "react";

type StatusPillVariant = "pill-turn" | "pill-waiting" | "pill-ready" | "pill-closed";

interface StatusPillProps {
  variant: StatusPillVariant;
  label: string;
  className?: string;
}

const dotShapeClass: Record<StatusPillVariant, string> = {
  "pill-turn": "cc-status-pill-dot--filled",
  "pill-waiting": "cc-status-pill-dot--hollow",
  "pill-ready": "cc-status-pill-dot--filled",
  "pill-closed": "cc-status-pill-dot--square",
};

export function StatusPill({ variant, label, className }: StatusPillProps): React.ReactElement {
  return (
    <span
      className={["cc-status-pill", `cc-status-pill--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={["cc-status-pill-dot", dotShapeClass[variant]]
          .join(" ")}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
