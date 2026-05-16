import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface SoloActingParty {
  actingRole: "INITIATOR" | "INVITEE";
  isSolo: boolean;
  setActingParty: (party: "initiator" | "invitee") => void;
}

function parseAsParam(value: string | null): "INITIATOR" | "INVITEE" {
  if (value === "invitee") return "INVITEE";
  return "INITIATOR";
}

export function useSoloActingParty(
  caseId: Id<"cases"> | undefined,
): SoloActingParty {
  const [searchParams, setSearchParams] = useSearchParams();
  const caseDoc = useQuery(
    api.cases.get,
    caseId ? { caseId } : "skip",
  );

  const actingRole = parseAsParam(searchParams.get("as"));

  const setActingParty = useCallback(
    (party: "initiator" | "invitee") => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("as", party);
        return next;
      });
    },
    [setSearchParams],
  );

  if (!caseDoc || !caseDoc.isSolo) {
    return {
      actingRole,
      isSolo: false,
      setActingParty: () => {},
    };
  }

  return {
    actingRole,
    isSolo: true,
    setActingParty,
  };
}
