import * as React from "react";

export interface MessageInputProps {
  onSend: (text: string) => void;
  isAiResponding?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function MessageInput({
  onSend,
  isAiResponding = false,
  placeholder = "Type a message...",
  className,
  autoFocus,
}: MessageInputProps): React.ReactElement {
  const [text, setText] = React.useState("");

  const trimmed = text.trim();
  const hasText = trimmed.length > 0;

  const send = React.useCallback(() => {
    const t = text.trim();
    if (t.length === 0) return;
    onSend(t);
    setText("");
  }, [text, onSend]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isAiResponding) {
          send();
        }
      }
    },
    [isAiResponding, send],
  );

  return (
    <div
      className={["cc-message-input", className].filter(Boolean).join(" ")}
      style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        aria-label="Message input"
        autoFocus={autoFocus}
        style={{
          flex: 1,
          resize: "none",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--font-size-chat)",
          lineHeight: "var(--line-height-chat)",
          padding: "10px 12px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
        }}
      />
      <button
        type="button"
        className="cc-btn cc-btn-primary cc-btn-md"
        disabled={isAiResponding || !hasText}
        onClick={send}
        aria-label="Send message"
      >
        Send
      </button>
    </div>
  );
}
