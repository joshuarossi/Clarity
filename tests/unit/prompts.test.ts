import { describe, it, expect } from "vitest";
import {
  assemblePrompt,
  PRIVATE_COACH_SYSTEM_PROMPT,
  ANTI_QUOTATION_INSTRUCTION,
  SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION,
} from "../../convex/lib/prompts";
import type {
  PromptRole,
  PromptMessage,
  FormFields,
  PromptContext,
  AssemblePromptOpts,
  AssemblePromptResult,
} from "../../convex/lib/prompts";

/**
 * WOR-99: Prompt assembly module tests
 *
 * Pure unit tests — no Convex runtime or convex-test needed.
 * At red state the import from convex/lib/prompts.ts produces TS2307
 * because the module has not been created yet.
 */

// ── Fixture data with unique marker strings ─────────────────────────────

const MARKER_A_PRIVATE_MSG = "MARKER_A_PRIVATE_MSG_alpha";
const MARKER_B_PRIVATE_MSG = "MARKER_B_PRIVATE_MSG_bravo";
const MARKER_A_FORM_TOPIC = "MARKER_A_FORM_TOPIC_alpha";
const MARKER_A_FORM_DESC = "MARKER_A_FORM_DESC_alpha";
const MARKER_A_FORM_OUTCOME = "MARKER_A_FORM_OUTCOME_alpha";
const MARKER_B_FORM_TOPIC = "MARKER_B_FORM_TOPIC_bravo";
const MARKER_B_FORM_DESC = "MARKER_B_FORM_DESC_bravo";
const MARKER_B_FORM_OUTCOME = "MARKER_B_FORM_OUTCOME_bravo";
const MARKER_A_SYNTHESIS = "MARKER_A_SYNTHESIS_alpha";
const MARKER_B_SYNTHESIS = "MARKER_B_SYNTHESIS_bravo";
const MARKER_JOINT_CHAT = "MARKER_JOINT_CHAT_shared";
const MARKER_TEMPLATE_COACH = "MARKER_TEMPLATE_COACH_instructions";
const MARKER_TEMPLATE_DRAFT = "MARKER_TEMPLATE_DRAFT_instructions";
const MARKER_TEMPLATE_GLOBAL = "MARKER_TEMPLATE_GLOBAL_guidance";

const partyAPrivateMessages: PromptMessage[] = [
  { role: "user", content: `Party A says: ${MARKER_A_PRIVATE_MSG}` },
  { role: "assistant", content: "Coach responds to Party A" },
];

const partyBPrivateMessages: PromptMessage[] = [
  { role: "user", content: `Party B says: ${MARKER_B_PRIVATE_MSG}` },
  { role: "assistant", content: "Coach responds to Party B" },
];

const partyAFormFields: FormFields = {
  mainTopic: MARKER_A_FORM_TOPIC,
  description: MARKER_A_FORM_DESC,
  desiredOutcome: MARKER_A_FORM_OUTCOME,
};

const partyBFormFields: FormFields = {
  mainTopic: MARKER_B_FORM_TOPIC,
  description: MARKER_B_FORM_DESC,
  desiredOutcome: MARKER_B_FORM_OUTCOME,
};

const jointChatHistory: PromptMessage[] = [
  { role: "user", content: `Joint message: ${MARKER_JOINT_CHAT}` },
  { role: "assistant", content: "Coach mediates" },
];

const templateVersion = {
  globalGuidance: MARKER_TEMPLATE_GLOBAL,
  coachInstructions: MARKER_TEMPLATE_COACH,
  draftCoachInstructions: MARKER_TEMPLATE_DRAFT,
};

function fullContext(): PromptContext {
  return {
    formFields: partyAFormFields,
    actingPartyPrivateMessages: partyAPrivateMessages,
    otherPartyPrivateMessages: partyBPrivateMessages,
    actingPartySynthesis: MARKER_A_SYNTHESIS,
    otherPartySynthesis: MARKER_B_SYNTHESIS,
    jointChatHistory,
  };
}

function serialize(result: AssemblePromptResult): string {
  return JSON.stringify({ system: result.system, messages: result.messages });
}

// ── AC 1: assemblePrompt signature & return shape ───────────────────────

describe("AC 1: assemblePrompt return shape", () => {
  const roles: PromptRole[] = [
    "PRIVATE_COACH",
    "COACH",
    "DRAFT_COACH",
    "SYNTHESIS",
  ];

  roles.forEach((role) => {
    it(`returns { system: string, messages: PromptMessage[] } for role ${role}`, () => {
      const opts: AssemblePromptOpts = {
        role,
        caseId: "case_001",
        actingUserId: "user_001",
        recentHistory: partyAPrivateMessages,
        context: fullContext(),
      };

      const result: AssemblePromptResult = assemblePrompt(opts);

      expect(typeof result.system).toBe("string");
      expect(result.system.length).toBeGreaterThan(0);
      expect(Array.isArray(result.messages)).toBe(true);

      for (const msg of result.messages) {
        expect(typeof msg.role).toBe("string");
        expect(["user", "assistant"]).toContain(msg.role);
        expect(typeof msg.content).toBe("string");
      }
    });
  });
});

// ── AC 2: PRIVATE_COACH isolation ───────────────────────────────────────

describe("AC 2: PRIVATE_COACH role — system prompt and context isolation", () => {
  it("system prompt contains the verbatim PRIVATE_COACH_SYSTEM_PROMPT constant", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_002",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      context: fullContext(),
    });

    expect(result.system).toContain(PRIVATE_COACH_SYSTEM_PROMPT);
  });

  it("messages contain the acting party's private message content", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_002",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).toContain(MARKER_A_PRIVATE_MSG);
  });

  it("output contains the acting party's form fields", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_002",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      context: {
        ...fullContext(),
        formFields: partyAFormFields,
      },
    });

    const output = serialize(result);
    expect(output).toContain(MARKER_A_FORM_TOPIC);
  });

  it("output does NOT contain the other party's private messages", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_002",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).not.toContain(MARKER_B_PRIVATE_MSG);
  });

  it("output does NOT contain the other party's synthesis", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_002",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).not.toContain(MARKER_B_SYNTHESIS);
  });
});

// ── AC 3: SYNTHESIS anti-quotation & output format ──────────────────────

describe("AC 3: SYNTHESIS role — anti-quotation instruction and JSON output format", () => {
  it("system prompt contains the verbatim ANTI_QUOTATION_INSTRUCTION", () => {
    const result = assemblePrompt({
      role: "SYNTHESIS",
      caseId: "case_003",
      actingUserId: "user_A",
      recentHistory: [],
      context: fullContext(),
    });

    expect(result.system).toContain(ANTI_QUOTATION_INSTRUCTION);
  });

  it("system prompt contains the SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION for JSON { forInitiator, forInvitee }", () => {
    const result = assemblePrompt({
      role: "SYNTHESIS",
      caseId: "case_003",
      actingUserId: "user_A",
      recentHistory: [],
      context: fullContext(),
    });

    expect(result.system).toContain(SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION);
  });

  it("messages include content from both parties' private messages", () => {
    const result = assemblePrompt({
      role: "SYNTHESIS",
      caseId: "case_003",
      actingUserId: "user_A",
      recentHistory: [],
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).toContain(MARKER_A_PRIVATE_MSG);
    expect(output).toContain(MARKER_B_PRIVATE_MSG);
  });
});

// ── AC 4: COACH context composition ─────────────────────────────────────

describe("AC 4: COACH role — joint chat + synthesis, no raw private messages", () => {
  it("output contains joint chat history", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_004",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).toContain(MARKER_JOINT_CHAT);
  });

  it("output contains both parties' synthesis texts", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_004",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).toContain(MARKER_A_SYNTHESIS);
    expect(output).toContain(MARKER_B_SYNTHESIS);
  });

  it("output does NOT contain raw private messages from either party", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_004",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).not.toContain(MARKER_A_PRIVATE_MSG);
    expect(output).not.toContain(MARKER_B_PRIVATE_MSG);
  });

  it("system prompt contains the anti-quotation instruction", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_004",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    expect(result.system).toContain(ANTI_QUOTATION_INSTRUCTION);
  });
});

// ── AC 5: DRAFT_COACH isolation ─────────────────────────────────────────

describe("AC 5: DRAFT_COACH role — own synthesis only, no other party data", () => {
  it("output contains the acting party's synthesis", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "case_005",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).toContain(MARKER_A_SYNTHESIS);
  });

  it("output does NOT contain the other party's synthesis", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "case_005",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).not.toContain(MARKER_B_SYNTHESIS);
  });

  it("output does NOT contain raw private messages from either party", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "case_005",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).not.toContain(MARKER_A_PRIVATE_MSG);
    expect(output).not.toContain(MARKER_B_PRIVATE_MSG);
  });

  it("output contains joint chat history", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "case_005",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    const output = serialize(result);
    expect(output).toContain(MARKER_JOINT_CHAT);
  });
});

// ── AC 6: Template injection ────────────────────────────────────────────

describe("AC 6: Template version injection", () => {
  it("COACH system prompt contains coachInstructions when templateVersion is provided", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_006",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      templateVersion,
      context: fullContext(),
    });

    expect(result.system).toContain(MARKER_TEMPLATE_COACH);
  });

  it("COACH system prompt does NOT contain template text when templateVersion is omitted", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_006",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    expect(result.system).not.toContain(MARKER_TEMPLATE_COACH);
    expect(result.system).not.toContain(MARKER_TEMPLATE_GLOBAL);
  });

  it("DRAFT_COACH system prompt contains draftCoachInstructions when templateVersion is provided", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "case_006",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      templateVersion,
      context: fullContext(),
    });

    expect(result.system).toContain(MARKER_TEMPLATE_DRAFT);
  });

  it("COACH falls back to globalGuidance when coachInstructions is absent", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_006",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      templateVersion: { globalGuidance: MARKER_TEMPLATE_GLOBAL },
      context: fullContext(),
    });

    expect(result.system).toContain(MARKER_TEMPLATE_GLOBAL);
  });

  it("DRAFT_COACH falls back to globalGuidance when draftCoachInstructions is absent", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "case_006",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      templateVersion: { globalGuidance: MARKER_TEMPLATE_GLOBAL },
      context: fullContext(),
    });

    expect(result.system).toContain(MARKER_TEMPLATE_GLOBAL);
  });

  it("PRIVATE_COACH ignores templateVersion even when provided", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_006",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      templateVersion,
      context: fullContext(),
    });

    expect(result.system).not.toContain(MARKER_TEMPLATE_COACH);
    expect(result.system).not.toContain(MARKER_TEMPLATE_DRAFT);
    expect(result.system).not.toContain(MARKER_TEMPLATE_GLOBAL);
  });

  it("SYNTHESIS ignores templateVersion even when provided", () => {
    const result = assemblePrompt({
      role: "SYNTHESIS",
      caseId: "case_003",
      actingUserId: "user_A",
      recentHistory: [],
      templateVersion,
      context: fullContext(),
    });

    expect(result.system).not.toContain(MARKER_TEMPLATE_COACH);
    expect(result.system).not.toContain(MARKER_TEMPLATE_DRAFT);
    expect(result.system).not.toContain(MARKER_TEMPLATE_GLOBAL);
  });

  it("template injection is additive — baseline prompt is preserved", () => {
    const withTemplate = assemblePrompt({
      role: "COACH",
      caseId: "case_006",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      templateVersion,
      context: fullContext(),
    });

    const withoutTemplate = assemblePrompt({
      role: "COACH",
      caseId: "case_006",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: fullContext(),
    });

    // The template version should contain the baseline content plus template additions
    expect(withTemplate.system).toContain(ANTI_QUOTATION_INSTRUCTION);
    expect(withoutTemplate.system).toContain(ANTI_QUOTATION_INSTRUCTION);
    expect(withTemplate.system.length).toBeGreaterThan(
      withoutTemplate.system.length
    );
  });
});

// ── AC 7: PRIVATE_COACH negative / defense-in-depth ─────────────────────

describe("AC 7: PRIVATE_COACH defense-in-depth — all other-party markers excluded", () => {
  it("excludes ALL other-party data even when caller provides it in context", () => {
    const contextWithAllPartyBData: PromptContext = {
      formFields: partyBFormFields,
      actingPartyPrivateMessages: partyAPrivateMessages,
      otherPartyPrivateMessages: partyBPrivateMessages,
      actingPartySynthesis: MARKER_A_SYNTHESIS,
      otherPartySynthesis: MARKER_B_SYNTHESIS,
      jointChatHistory,
    };

    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_007",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      context: contextWithAllPartyBData,
    });

    const output = serialize(result);

    // Other party's private messages must not appear
    expect(output).not.toContain(MARKER_B_PRIVATE_MSG);

    // Other party's synthesis must not appear
    expect(output).not.toContain(MARKER_B_SYNTHESIS);

    // Joint chat must not appear for PRIVATE_COACH
    expect(output).not.toContain(MARKER_JOINT_CHAT);
  });

  it("uses acting party form fields from context.formFields, ignoring other-party fields when set correctly", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_007",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      context: {
        formFields: partyAFormFields,
        otherPartyPrivateMessages: partyBPrivateMessages,
        otherPartySynthesis: MARKER_B_SYNTHESIS,
      },
    });

    const output = serialize(result);

    // Acting party form fields should be present
    expect(output).toContain(MARKER_A_FORM_TOPIC);
    expect(output).toContain(MARKER_A_FORM_DESC);
    expect(output).toContain(MARKER_A_FORM_OUTCOME);

    // Other party data must not appear
    expect(output).not.toContain(MARKER_B_PRIVATE_MSG);
    expect(output).not.toContain(MARKER_B_SYNTHESIS);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("handles empty recentHistory for PRIVATE_COACH (first message)", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_edge_1",
      actingUserId: "user_A",
      recentHistory: [],
      context: { formFields: partyAFormFields },
    });

    expect(typeof result.system).toBe("string");
    expect(result.system.length).toBeGreaterThan(0);
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("handles undefined formFields for PRIVATE_COACH", () => {
    const result = assemblePrompt({
      role: "PRIVATE_COACH",
      caseId: "case_edge_2",
      actingUserId: "user_A",
      recentHistory: partyAPrivateMessages,
      context: {},
    });

    expect(typeof result.system).toBe("string");
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("handles missing synthesis for COACH (synthesis not yet generated)", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_edge_3",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: { jointChatHistory },
    });

    expect(typeof result.system).toBe("string");
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("handles missing synthesis for DRAFT_COACH", () => {
    const result = assemblePrompt({
      role: "DRAFT_COACH",
      caseId: "case_edge_4",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      context: { jointChatHistory },
    });

    expect(typeof result.system).toBe("string");
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("handles empty globalGuidance in templateVersion for COACH (no template text appended)", () => {
    const result = assemblePrompt({
      role: "COACH",
      caseId: "case_edge_5",
      actingUserId: "user_A",
      recentHistory: jointChatHistory,
      templateVersion: { globalGuidance: "" },
      context: fullContext(),
    });

    // Baseline prompt should still be present
    expect(result.system).toContain(ANTI_QUOTATION_INSTRUCTION);
  });
});
