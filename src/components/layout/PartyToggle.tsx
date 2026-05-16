import * as React from "react";

interface PartyToggleProps {
  initiatorName: string;
  inviteeName: string;
  activeParty: "initiator" | "invitee";
  onToggle: (party: "initiator" | "invitee") => void;
}

export function PartyToggle({
  initiatorName,
  inviteeName,
  activeParty,
  onToggle,
}: PartyToggleProps): React.ReactElement {
  return (
    <div className="party-toggle" data-testid="party-toggle">
      <span className="party-toggle-label">VIEWING AS</span>
      <div className="party-toggle-buttons" role="group" aria-label="Party toggle">
        <button
          type="button"
          className="party-toggle-btn"
          data-active={activeParty === "initiator" ? "true" : "false"}
          onClick={() => onToggle("initiator")}
          aria-pressed={activeParty === "initiator"}
        >
          {initiatorName}
        </button>
        <button
          type="button"
          className="party-toggle-btn"
          data-active={activeParty === "invitee" ? "true" : "false"}
          onClick={() => onToggle("invitee")}
          aria-pressed={activeParty === "invitee"}
        >
          {inviteeName}
        </button>
      </div>
    </div>
  );
}
