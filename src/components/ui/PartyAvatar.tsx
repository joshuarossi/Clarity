import * as React from "react";

type PartyRole = "initiator" | "invitee" | "coach";
type AvatarSize = "sm" | "md" | "lg";

interface PartyAvatarProps {
  role: PartyRole;
  name: string;
  size?: AvatarSize;
  className?: string;
}

const sizeClass: Record<AvatarSize, string> = {
  sm: "cc-avatar--sm",
  md: "cc-avatar--md",
  lg: "cc-avatar--lg",
};

const sizePx: Record<AvatarSize, number> = {
  sm: 24,
  md: 32,
  lg: 40,
};

const roleClass: Record<PartyRole, string> = {
  initiator: "cc-avatar--initiator",
  invitee: "cc-avatar--invitee",
  coach: "cc-avatar--coach",
};

const roleColorVar: Record<PartyRole, string> = {
  initiator: "var(--party-initiator)",
  invitee: "var(--party-invitee)",
  coach: "var(--coach-accent)",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) return "";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PartyAvatar({
  role,
  name,
  size = "md",
  className,
}: PartyAvatarProps): React.ReactElement {
  const initials = getInitials(name);
  const display = role === "coach" && !initials ? "⟡" : initials;

  const px = sizePx[size];

  return (
    <span
      className={["cc-avatar", sizeClass[size], roleClass[role], className]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: `${px}px`,
        height: `${px}px`,
        backgroundColor: roleColorVar[role],
        color: "#fff",
      }}
      aria-hidden="true"
    >
      {display}
    </span>
  );
}
