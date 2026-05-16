import * as React from "react";

export interface DraftReadyCardProps {
  draftText: string;
  onSend: () => void;
  onEdit: () => void;
  onKeepRefining: () => void;
  onDiscard: () => void;
  isSending?: boolean;
}

export function DraftReadyCard({
  draftText,
  onSend,
  onEdit,
  onKeepRefining,
  onDiscard,
  isSending = false,
}: DraftReadyCardProps): React.ReactElement {
  return (
    <div className="cc-draft-ready">
      <blockquote className="cc-draft-ready-quote">{draftText}</blockquote>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          className="cc-btn cc-btn-primary cc-btn-md"
          onClick={onSend}
          disabled={isSending}
        >
          {isSending ? "Sending..." : "Send this message"}
        </button>
        <button
          type="button"
          className="cc-btn cc-btn-secondary cc-btn-md"
          onClick={onEdit}
          disabled={isSending}
        >
          Edit before sending
        </button>
        <button
          type="button"
          className="cc-btn cc-btn-ghost cc-btn-md"
          onClick={onKeepRefining}
          disabled={isSending}
        >
          Keep refining with Coach
        </button>
        <button
          type="button"
          className="cc-btn cc-btn-ghost cc-btn-md cc-text-danger"
          onClick={onDiscard}
          disabled={isSending}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
