import * as React from "react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "./MessageBubble";

export interface ChatWindowProps {
  messages: ChatMessage[];
  className?: string;
  onRetry?: () => void;
}

export function ChatWindow({
  messages,
  className,
  onRetry,
}: ChatWindowProps): React.ReactElement {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isAtBottomRef = React.useRef(true);

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 50;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  React.useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      onScroll={handleScroll}
      className={className}
      style={{
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 16,
      }}
    >
      {messages.map((msg) => (
        <div key={msg.id} className="cc-bubble-enter">
          <MessageBubble
            variant={msg.variant}
            status={msg.status}
            content={msg.content}
            authorName={msg.authorName}
            createdAt={msg.createdAt}
            onRetry={msg.status === "ERROR" ? onRetry : undefined}
          />
        </div>
      ))}
    </div>
  );
}
