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

const roleClass: Record<PartyRole, string> = {
  initiator: "cc-avatar--initiator",
  invitee: "cc-avatar--invitee",
  coach: "cc-avatar--coach",
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

  return (
    <span
      className={["cc-avatar", sizeClass[size], roleClass[role], className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {display}
    </span>
  );
}
