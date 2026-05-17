import * as React from "react";
import { StreamingIndicator } from "./StreamingIndicator";
import { MarkdownContent } from "./MarkdownContent";

export type BubbleVariant =
  | "user"
  | "coach"
  | "coach-joint"
  | "coach-intervention"
  | "party-initiator"
  | "party-invitee"
  | "error";

export type MessageStatus = "STREAMING" | "COMPLETE" | "ERROR";

export interface ChatMessage {
  id: string;
  variant: BubbleVariant;
  status: MessageStatus;
  content: string;
  authorName?: string;
  createdAt: number;
}

export interface MessageBubbleProps {
  variant: BubbleVariant;
  status: MessageStatus;
  content: string;
  authorName?: string;
  createdAt: number;
  onRetry?: () => void;
  onCopy?: () => void;
  className?: string;
}

const VARIANT_CLASS: Record<BubbleVariant, string> = {
  user: "cc-bubble",
  coach: "cc-bubble-coach",
  "coach-joint": "cc-bubble-coach-joint",
  "coach-intervention": "cc-bubble-coach-intervention",
  "party-initiator": "cc-bubble-party-initiator",
  "party-invitee": "cc-bubble-party-invitee",
  error: "cc-bubble-error",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MessageBubble({
  variant,
  status,
  content,
  authorName,
  createdAt,
  onRetry,
  onCopy,
  className,
}: MessageBubbleProps): React.ReactElement {
  const bubbleClass =
    status === "ERROR" ? "cc-bubble-error" : VARIANT_CLASS[variant];

  const handleCopy = React.useCallback(() => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(content).then(() => {
        onCopy?.();
      }).catch(() => {
        // Fail silently per contract
      });
    } else {
      // Clipboard API unavailable — still invoke callback
      onCopy?.();
    }
  }, [content, onCopy]);

  return (
    <div
      className={[bubbleClass, className].filter(Boolean).join(" ")}
      data-status={status}
    >
      {authorName && <span className="cc-bubble-avatar">{authorName}</span>}
      {["coach", "coach-joint", "coach-intervention"].includes(variant) ? (
        <MarkdownContent content={content} />
      ) : (
        <span>{content}</span>
      )}
      {status === "STREAMING" && <StreamingIndicator />}
      {status === "COMPLETE" && (
        <>
          <time
            className="cc-bubble-timestamp"
            dateTime={new Date(createdAt).toISOString()}
            style={{ marginTop: 4 }}
          >
            {formatTimestamp(createdAt)}
          </time>
          <button
            type="button"
            className="cc-btn cc-btn-ghost cc-btn-sm"
            aria-label="Copy message"
            onClick={handleCopy}
            style={{ marginTop: 4 }}
          >
            Copy
          </button>
        </>
      )}
      {status === "ERROR" && onRetry && (
        <button
          type="button"
          className="cc-btn cc-btn-danger cc-btn-sm"
          aria-label="Retry message"
          onClick={onRetry}
          style={{ marginTop: 4 }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
