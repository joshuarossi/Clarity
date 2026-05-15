import * as React from "react";

export interface StreamingIndicatorProps {
  className?: string;
}

export function StreamingIndicator({
  className,
}: StreamingIndicatorProps): React.ReactElement {
  return (
    <span
      className={["cc-streaming-cursor", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
