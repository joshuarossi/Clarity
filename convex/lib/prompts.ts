/**
 * Prompt assembly module — single point of enforcement for prompt-level privacy.
 * Pure synchronous helper; no Convex runtime dependencies.
 * Implements TechSpec §6.3.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptRole = "PRIVATE_COACH" | "COACH" | "DRAFT_COACH" | "SYNTHESIS";

export interface PromptMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FormFields {
  mainTopic?: string;
  description?: string;
  desiredOutcome?: string;
}

export interface PromptContext {
  formFields?: FormFields;
  actingPartyPrivateMessages?: PromptMessage[];
  otherPartyPrivateMessages?: PromptMessage[];
  actingPartySynthesis?: string;
  otherPartySynthesis?: string;
  jointChatHistory?: PromptMessage[];
}

export interface AssemblePromptOpts {
  role: PromptRole;
  caseId: string;
  actingUserId: string;
  recentHistory: PromptMessage[];
  templateVersion?: {
    globalGuidance: string;
    coachInstructions?: string;
    draftCoachInstructions?: string;
  };
  context: PromptContext;
}

export interface AssemblePromptResult {
  system: string;
  messages: PromptMessage[];
}

// ---------------------------------------------------------------------------
// Constants (verbatim from TechSpec §6.3)
// ---------------------------------------------------------------------------

export const PRIVATE_COACH_SYSTEM_PROMPT =
  "You are a calm, curious, non-judgmental listener helping a person articulate their perspective in an interpersonal conflict. Ask clarifying questions. Reflect what they say. Help them identify what they actually want, what they're feeling, and what the other person might be thinking. Do not take sides. Do not tell them they're right or wrong. Your only goal is to help them prepare to communicate with the other party clearly and calmly.";

export const ANTI_QUOTATION_INSTRUCTION =
  "You have access to both parties' private content for context. In your outputs, NEVER quote, closely paraphrase, or otherwise surface the other party's raw words. Synthesize themes and positions in your own words only. If you cannot make a point without quoting, omit it.";

export const SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION =
  'Your output must be strict JSON with exactly two keys: { "forInitiator": "...", "forInvitee": "..." }. Each value is a plain-text synthesis for that party containing: (1) areas of likely agreement, (2) genuine points of disagreement, (3) suggested communication approaches for the joint session.';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildFormFieldsContext(formFields?: FormFields): string {
  if (!formFields) return "";
  const parts: string[] = [];
  if (formFields.mainTopic) parts.push(`Main topic: ${formFields.mainTopic}`);
  if (formFields.description) parts.push(`Description: ${formFields.description}`);
  if (formFields.desiredOutcome) parts.push(`Desired outcome: ${formFields.desiredOutcome}`);
  if (parts.length === 0) return "";
  return parts.join("\n");
}

function appendTemplate(
  base: string,
  role: PromptRole,
  templateVersion?: AssemblePromptOpts["templateVersion"],
): string {
  if (!templateVersion) return base;

  // Per contract: templates NOT applied to PRIVATE_COACH or SYNTHESIS
  if (role === "PRIVATE_COACH" || role === "SYNTHESIS") return base;

  let instructions: string | undefined;
  if (role === "COACH") {
    instructions = templateVersion.coachInstructions || templateVersion.globalGuidance;
  } else if (role === "DRAFT_COACH") {
    instructions = templateVersion.draftCoachInstructions || templateVersion.globalGuidance;
  }

  if (instructions) {
    return base + "\n\n" + instructions;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Role-specific assemblers
// ---------------------------------------------------------------------------

function assemblePrivateCoach(opts: AssemblePromptOpts): AssemblePromptResult {
  // PRIVATE_COACH: only acting party's form fields + recentHistory.
  // No other-party data. Template NOT applied.
  const system = PRIVATE_COACH_SYSTEM_PROMPT;
  const messages: PromptMessage[] = [];

  const formContext = buildFormFieldsContext(opts.context.formFields);
  if (formContext) {
    messages.push({
      role: "user",
      content: `[Context — my situation]\n${formContext}`,
    });
  }

  messages.push(...opts.recentHistory);

  return { system, messages };
}

function assembleSynthesis(opts: AssemblePromptOpts): AssemblePromptResult {
  // SYNTHESIS: both parties' private messages, anti-quotation, JSON output format.
  // Template NOT applied.
  const system = [
    "You are an impartial synthesis engine for an interpersonal conflict resolution platform.",
    "",
    ANTI_QUOTATION_INSTRUCTION,
    "",
    SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION,
  ].join("\n");

  const messages: PromptMessage[] = [];

  // Include acting party's private messages as context
  if (opts.context.actingPartyPrivateMessages?.length) {
    messages.push({
      role: "user",
      content:
        "[Party A private coaching messages]\n" +
        opts.context.actingPartyPrivateMessages.map((m) => `${m.role}: ${m.content}`).join("\n"),
    });
  }

  // Include other party's private messages as context
  if (opts.context.otherPartyPrivateMessages?.length) {
    messages.push({
      role: "user",
      content:
        "[Party B private coaching messages]\n" +
        opts.context.otherPartyPrivateMessages.map((m) => `${m.role}: ${m.content}`).join("\n"),
    });
  }

  // Include recentHistory (typically empty for one-shot synthesis, but respect the contract)
  messages.push(...opts.recentHistory);

  return { system, messages };
}

function assembleCoach(opts: AssemblePromptOpts): AssemblePromptResult {
  // COACH: joint chat history + both synthesis texts. No raw private messages.
  // Anti-quotation rule included. Template applied if available.
  let system = [
    "You are a facilitative Coach guiding a joint conversation between two parties in conflict.",
    "",
    ANTI_QUOTATION_INSTRUCTION,
  ].join("\n");

  system = appendTemplate(system, "COACH", opts.templateVersion);

  const messages: PromptMessage[] = [];

  // Inject synthesis texts as context
  const synthesisParts: string[] = [];
  if (opts.context.actingPartySynthesis) {
    synthesisParts.push(`Acting party synthesis: ${opts.context.actingPartySynthesis}`);
  }
  if (opts.context.otherPartySynthesis) {
    synthesisParts.push(`Other party synthesis: ${opts.context.otherPartySynthesis}`);
  }
  if (synthesisParts.length > 0) {
    messages.push({
      role: "user",
      content: "[Synthesis context]\n" + synthesisParts.join("\n\n"),
    });
  }

  // Joint chat history
  if (opts.context.jointChatHistory?.length) {
    messages.push(...opts.context.jointChatHistory);
  }

  // recentHistory (primary conversation messages)
  messages.push(...opts.recentHistory);

  return { system, messages };
}

function assembleDraftCoach(opts: AssemblePromptOpts): AssemblePromptResult {
  // DRAFT_COACH: joint chat history + acting user's synthesis ONLY.
  // No other party's synthesis or private content.
  // Template applied if available.
  let system = [
    "You are a Draft Coach helping a user craft a clear, constructive message for their joint conversation.",
    "Ask clarifying questions about their intent, surface tone issues, and only generate a polished draft when the user signals readiness.",
  ].join(" ");

  system = appendTemplate(system, "DRAFT_COACH", opts.templateVersion);

  const messages: PromptMessage[] = [];

  // Only acting party's synthesis
  if (opts.context.actingPartySynthesis) {
    messages.push({
      role: "user",
      content: `[Your synthesis context]\n${opts.context.actingPartySynthesis}`,
    });
  }

  // Joint chat history
  if (opts.context.jointChatHistory?.length) {
    messages.push(...opts.context.jointChatHistory);
  }

  // recentHistory (draft coach conversation)
  messages.push(...opts.recentHistory);

  return { system, messages };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function assemblePrompt(opts: AssemblePromptOpts): AssemblePromptResult {
  switch (opts.role) {
    case "PRIVATE_COACH":
      return assemblePrivateCoach(opts);
    case "SYNTHESIS":
      return assembleSynthesis(opts);
    case "COACH":
      return assembleCoach(opts);
    case "DRAFT_COACH":
      return assembleDraftCoach(opts);
  }
}
