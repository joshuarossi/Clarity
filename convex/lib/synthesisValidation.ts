/**
 * Pure validation module for synthesis output — no Convex runtime dependencies.
 */

export type SynthesisOutput = {
  forInitiator: string;
  forInvitee: string;
};

export const GENERIC_FALLBACK_SYNTHESIS: SynthesisOutput = {
  forInitiator:
    "Both parties have shared their perspectives, and there are areas of common ground to build on. In the joint session, focus on expressing your needs clearly and listening to understand the other person's point of view. Start with shared goals before addressing differences.",
  forInvitee:
    "Both parties have shared their perspectives, and there are areas of common ground to build on. In the joint session, focus on expressing your needs clearly and listening to understand the other person's point of view. Start with shared goals before addressing differences.",
};

export function validateSynthesisOutput(
  raw: string,
): { ok: true; data: SynthesisOutput } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const detail = e instanceof SyntaxError ? e.message : "unknown parse error";
    return { ok: false, error: `Invalid JSON: ${detail}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (!keys.includes("forInitiator")) {
    return { ok: false, error: "Missing key: forInitiator" };
  }
  if (!keys.includes("forInvitee")) {
    return { ok: false, error: "Missing key: forInvitee" };
  }
  if (keys.length !== 2) {
    return { ok: false, error: "Extra keys found" };
  }

  if (typeof obj.forInitiator !== "string") {
    return { ok: false, error: "forInitiator must be a string" };
  }
  if (typeof obj.forInvitee !== "string") {
    return { ok: false, error: "forInvitee must be a string" };
  }

  return {
    ok: true,
    data: {
      forInitiator: obj.forInitiator,
      forInvitee: obj.forInvitee,
    },
  };
}
