import * as React from "react";

export interface MarkdownContentProps {
  content: string;
  className?: string;
}

function parseInline(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let partKey = 0;
  // Match **bold** and *italic* (non-greedy)
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      parts.push(<strong key={partKey++}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={partKey++}>{match[2]}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [line];
}

export function MarkdownContent({ content, className }: MarkdownContentProps): React.ReactElement {
  if (!content) {
    return <span className={className} />;
  }

  const lines = content.split("\n");
  const elements: React.ReactElement[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    if (line.startsWith("### ")) {
      elements.push(<h3 key={key++}>{parseInline(line.slice(4))}</h3>);
      i++;
      continue;
    }

    // Unordered list
    if (line.startsWith("- ")) {
      const items: React.ReactElement[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(<li key={key++}>{parseInline(lines[i].slice(2))}</li>);
        i++;
      }
      elements.push(<ul key={key++}>{items}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactElement[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const text = lines[i].replace(/^\d+\.\s/, "");
        items.push(<li key={key++}>{parseInline(text)}</li>);
        i++;
      }
      elements.push(<ol key={key++}>{items}</ol>);
      continue;
    }

    // Blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(<p key={key++}>{parseInline(line)}</p>);
    i++;
  }

  return <span className={className}>{elements}</span>;
}
