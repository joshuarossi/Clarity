---
task_id: WOR-99
ticket_summary: "Prompt assembly module (convex/lib/prompts.ts)"
ac_refs:
  - "assemblePrompt function accepts {role, caseId, actingUserId, recentHistory, templateVersion?} and returns {system: string, messages: Message[]}"
  - "PRIVATE_COACH role: system prompt matches TechSpec §6.3.1 verbatim, context includes only the acting party's form fields and private message history, no other party data is included"
  - "SYNTHESIS role: system prompt includes the verbatim anti-quotation instruction from TechSpec §6.3.2, output format is strict JSON {forInitiator, forInvitee}"
  - "COACH role: context includes joint chat history + both parties' synthesis texts (NOT raw private messages), anti-quotation rule included"
  - "DRAFT_COACH role: context includes drafting user's joint-chat history + their own synthesis, NOT the other party's synthesis or private content"
  - "Template version instructions are injected when a category-specific template is available"
  - "Vitest unit tests verify context isolation for each role — PRIVATE_COACH context must not contain other party's messages"
files:
  - path: convex/lib/prompts.ts
    role: helper
    action: create
    exports:
      - "PromptRole — string literal union type: 'PRIVATE_COACH' | 'COACH' | 'DRAFT_COACH' | 'SYNTHESIS'"
      - "PromptMessage — interface { role: 'user' | 'assistant'; content: string } representing an LLM conversation turn"
      - "FormFields — interface { mainTopic?: string; description?: string; desiredOutcome?: string }"
      - "PromptContext — interface providing role-specific data (formFields, party messages, synthesis texts)"
      - "AssemblePromptOpts — interface for the full options object passed to assemblePrompt"
      - "AssemblePromptResult — interface { system: string; messages: PromptMessage[] }"
      - "assemblePrompt — the main function that builds system prompt + messages for a given AI role"
      - "PRIVATE_COACH_SYSTEM_PROMPT — exported const string, the verbatim §6.3.1 system prompt"
      - "ANTI_QUOTATION_INSTRUCTION — exported const string, the verbatim §6.3.2 anti-quotation rule"
      - "SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION — exported const string, the JSON output format instruction"
  - path: tests/unit/prompts.test.ts
    role: test-infrastructure
    action: create
    exports: []
signatures:
  - "type PromptRole = 'PRIVATE_COACH' | 'COACH' | 'DRAFT_COACH' | 'SYNTHESIS';"
  - "interface PromptMessage { role: 'user' | 'assistant'; content: string; }"
  - "interface FormFields { mainTopic?: string; description?: string; desiredOutcome?: string; }"
  - |
    interface PromptContext {
      formFields?: FormFields;
      actingPartyPrivateMessages?: PromptMessage[];
      otherPartyPrivateMessages?: PromptMessage[];
      actingPartySynthesis?: string;
      otherPartySynthesis?: string;
      jointChatHistory?: PromptMessage[];
    }
  - |
    interface AssemblePromptOpts {
      role: PromptRole;
      caseId: string;
      actingUserId: string;
      recentHistory: PromptMessage[];
      templateVersion?: { globalGuidance: string; coachInstructions?: string; draftCoachInstructions?: string };
      context: PromptContext;
    }
  - "interface AssemblePromptResult { system: string; messages: PromptMessage[]; }"
  - "function assemblePrompt(opts: AssemblePromptOpts): AssemblePromptResult;"
  - "const PRIVATE_COACH_SYSTEM_PROMPT: string;"
  - "const ANTI_QUOTATION_INSTRUCTION: string;"
  - "const SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION: string;"
queries_used: []
invariants:
  - "PRIVATE_COACH context isolation: the returned system prompt and messages array must contain ZERO data from the other party — no other party's form fields, private messages, or synthesis"
  - "SYNTHESIS anti-quotation: the system prompt must contain the verbatim anti-quotation instruction from TechSpec §6.3.2"
  - "SYNTHESIS output format: the system prompt must instruct strict JSON output {forInitiator, forInvitee}"
  - "COACH context: messages include joint chat history and both parties' synthesis texts but NEVER raw private messages from either party"
  - "COACH anti-quotation: the system prompt includes the anti-quotation instruction"
  - "DRAFT_COACH isolation: messages include only the acting user's synthesis, NEVER the other party's synthesis or private content"
  - "Template injection is additive: when templateVersion is provided, its instructions are appended to the system prompt; the baseline prompt is never replaced"
  - "The module is a pure helper with no Convex runtime dependencies — no database reads, no action/mutation decorators, no async"
non_goals:
  - "No transcript compression — TechSpec §6.4 compression is a separate concern handled by the caller before passing recentHistory"
  - "No response filter — TechSpec §6.3.2 server-side response filter (tokenization + substring matching) is a separate ticket (T6)"
  - "No AI API calls — this module only assembles prompts; the caller invokes the Claude API"
  - "No database access — callers fetch all data and pass it in via the context parameter"
  - "No streaming logic — handled by the action that calls assemblePrompt"
tested_by:
  - ac: "assemblePrompt function accepts {role, caseId, actingUserId, recentHistory, templateVersion?} and returns {system: string, messages: Message[]}"
    layer: unit
    file: tests/unit/prompts.test.ts
  - ac: "PRIVATE_COACH role: system prompt matches TechSpec §6.3.1 verbatim, context includes only the acting party's form fields and private message history, no other party data is included"
    layer: unit
    file: tests/unit/prompts.test.ts
  - ac: "SYNTHESIS role: system prompt includes the verbatim anti-quotation instruction from TechSpec §6.3.2, output format is strict JSON {forInitiator, forInvitee}"
    layer: unit
    file: tests/unit/prompts.test.ts
  - ac: "COACH role: context includes joint chat history + both parties' synthesis texts (NOT raw private messages), anti-quotation rule included"
    layer: unit
    file: tests/unit/prompts.test.ts
  - ac: "DRAFT_COACH role: context includes drafting user's joint-chat history + their own synthesis, NOT the other party's synthesis or private content"
    layer: unit
    file: tests/unit/prompts.test.ts
  - ac: "Template version instructions are injected when a category-specific template is available"
    layer: unit
    file: tests/unit/prompts.test.ts
  - ac: "Vitest unit tests verify context isolation for each role — PRIVATE_COACH context must not contain other party's messages"
    layer: unit
    file: tests/unit/prompts.test.ts
---

# Contract: WOR-99 — Prompt assembly module (convex/lib/prompts.ts)

## Why this work exists

Every AI interaction in Clarity — private coaching, synthesis, joint-chat coaching, and draft coaching — needs a consistently assembled prompt that enforces strict context isolation between parties. Getting this boundary wrong is the highest-severity privacy risk in the system: the Private Coach must never see the other party's data, the Synthesis role must include an anti-quotation instruction, and the Draft Coach must only see the acting user's own synthesis. This module is the single point of enforcement for prompt-level privacy, implementing TechSpec §6.3.

## Files and exports

### `convex/lib/prompts.ts` (create, helper)

A pure synchronous helper module with no Convex runtime dependencies. It imports nothing from `"convex/server"` — no `query`, `mutation`, or `action` decorators. It does not read from the database. All data is passed in by the caller (a Convex action that fetches the relevant records and passes them to `assemblePrompt`).

The module exports types, constants, and the main `assemblePrompt` function.

**Why a `context` parameter is needed beyond `recentHistory`:** The TechSpec §6.3 signature shows `recentHistory: Message[]`, but each role requires different supplementary data (form fields for PRIVATE_COACH, both parties' private messages for SYNTHESIS, synthesis texts for COACH/DRAFT_COACH). Since the function is pure and cannot fetch data itself, the caller must provide this data. The `context: PromptContext` parameter carries role-specific data. The `recentHistory` field carries the primary conversation messages for the role (private messages for PRIVATE_COACH, joint chat for COACH/DRAFT_COACH, empty for SYNTHESIS since it's one-shot). The `context` provides supplementary data that gets injected into the system prompt or prepended as context messages.

**Why `caseId` and `actingUserId` are strings, not `Id<"cases">`:** The module is a pure helper that does not import from `convex/server` or the generated Convex types. It receives these IDs for inclusion in prompts (e.g., "You are coaching the user in case {caseId}") but never uses them for database lookups. The callers (Convex actions) pass `Id` values which are strings at runtime.

**Exported constants:** `PRIVATE_COACH_SYSTEM_PROMPT`, `ANTI_QUOTATION_INSTRUCTION`, and `SYNTHESIS_OUTPUT_FORMAT_INSTRUCTION` are exported as named constants so that tests can assert the system prompt contains these exact strings without hardcoding them in the test file. This also makes the verbatim spec text auditable in one place.

### `tests/unit/prompts.test.ts` (create, test-infrastructure)

Unit tests using Vitest. Since `convex/lib/prompts.ts` is a pure module, tests import directly and call `assemblePrompt` with fixture data — no `convex-test` needed. Tests use unique marker strings in fixture data (e.g., `"MARKER_PARTY_B_PRIVATE_MSG"`) to assert context isolation: after calling `assemblePrompt` for PRIVATE_COACH with Party A, the entire serialized output must not contain any of Party B's marker strings.

## Data dependencies

None. This module is a pure function — it receives all data via parameters and returns a prompt. It does not call any Convex queries, mutations, or actions. It does not make any network requests.

The callers (Convex actions for each AI role) are responsible for fetching the relevant data from the database and passing it in via `context`. The data shapes the callers will provide:

- **Form fields** (`formFields`): From `partyStates` table — `mainTopic`, `description`, `desiredOutcome` for the acting party.
- **Private messages** (`actingPartyPrivateMessages`, `otherPartyPrivateMessages`): From `privateMessages` table, filtered by `caseId` and `userId`. Each is mapped to `{ role: "user" | "assistant", content }` by the caller.
- **Synthesis texts** (`actingPartySynthesis`, `otherPartySynthesis`): From `partyStates.synthesisText` for the relevant parties.
- **Joint chat history** (`jointChatHistory`): From `jointMessages` table, mapped to `PromptMessage` by the caller.

## Invariants

### PRIVATE_COACH context isolation (highest priority)

When `role === "PRIVATE_COACH"`, the function must produce output containing ONLY the acting party's data. Specifically:

- The system prompt is the verbatim §6.3.1 prompt (the `PRIVATE_COACH_SYSTEM_PROMPT` constant).
- Form fields from `context.formFields` are injected into the messages (as a user-role context message prepended to the conversation, or embedded in the system prompt).
- `recentHistory` (the acting party's private messages) is included in the returned messages.
- The function MUST NOT read or include `context.otherPartyPrivateMessages`, `context.otherPartySynthesis`, or any other-party data. Even if the caller mistakenly passes other-party data in the context, the function ignores those fields for PRIVATE_COACH.

This is enforced by the function's role-switching logic: for PRIVATE_COACH, only `context.formFields` and `recentHistory` are consumed.

### SYNTHESIS anti-quotation and output format

When `role === "SYNTHESIS"`, the system prompt must include:

1. The verbatim anti-quotation instruction: *"You have access to both parties' private content for context. In your outputs, NEVER quote, closely paraphrase, or otherwise surface the other party's raw words. Synthesize themes and positions in your own words only. If you cannot make a point without quoting, omit it."*
2. The output format instruction requiring strict JSON: `{ "forInitiator": "...", "forInvitee": "..." }`.
3. Both parties' private messages from `context.actingPartyPrivateMessages` and `context.otherPartyPrivateMessages` are included in the messages array as context for the model.

### COACH context composition

When `role === "COACH"`, messages include `context.jointChatHistory` (or `recentHistory`) and both `context.actingPartySynthesis` and `context.otherPartySynthesis` injected as context. Raw private messages are NEVER included — the synthesis texts are the privacy-scrubbed summaries. The system prompt includes the anti-quotation instruction.

### DRAFT_COACH isolation

When `role === "DRAFT_COACH"`, messages include the joint chat history and ONLY `context.actingPartySynthesis`. The function MUST NOT include `context.otherPartySynthesis` or any private messages. This prevents one party from probing the other's position through the Draft Coach.

### Template injection is additive

When `templateVersion` is provided, the function appends the relevant instructions to the system prompt:
- For COACH: `templateVersion.coachInstructions` (if present), falling back to `templateVersion.globalGuidance`.
- For DRAFT_COACH: `templateVersion.draftCoachInstructions` (if present), falling back to `templateVersion.globalGuidance`.
- For PRIVATE_COACH: template is NOT applied (§6.3.1 says "Template applied: NONE").
- For SYNTHESIS: template is NOT applied (synthesis uses a fixed prompt).

The baseline system prompt is never replaced by the template — template instructions are appended after the baseline.

### Pure module

The module has no runtime dependencies beyond standard TypeScript. No imports from `convex/server`, no `async`, no database reads, no external API calls. This makes it trivially unit-testable.

## Edge cases

### Loading state

Not applicable. This is a pure synchronous function — there is no loading state. If the caller has not yet fetched the data, it should not call `assemblePrompt`.

### Empty form fields

When `context.formFields` has all fields `undefined` (party hasn't filled out the form yet), the function still produces a valid prompt. The form-fields section of the system prompt or context message is simply omitted or includes a note that form data is not yet available.

### Empty message history

When `recentHistory` is an empty array (first message in a conversation), the function returns a valid prompt with only the system prompt and any context-injected messages (form fields, synthesis). The `messages` array may contain only the context messages.

### Missing synthesis for COACH/DRAFT_COACH

If `context.actingPartySynthesis` or `context.otherPartySynthesis` is `undefined` (synthesis not yet generated), the function still assembles a valid prompt. The synthesis section is omitted from the context. This can happen if the Coach is called before synthesis completes (edge case in the state machine, but the prompt module should not crash).

### Template with no role-specific instructions

When `templateVersion` is provided but lacks `coachInstructions` for COACH or `draftCoachInstructions` for DRAFT_COACH, the function falls back to `templateVersion.globalGuidance`. If `globalGuidance` is also empty string, no template text is appended.

## Non-goals

**No transcript compression.** TechSpec §6.4 describes a compression strategy for long transcripts. That logic runs before `assemblePrompt` is called — the caller passes already-compressed `recentHistory`. This module assumes the messages fit in context.

**No response filter.** The server-side response filter from TechSpec §6.3.2 (tokenization + substring matching to detect near-verbatim leakage) is a separate ticket (T6). This module assembles prompts; it does not post-process AI responses.

**No AI API calls.** The module returns prompt data. The caller (a Convex action) passes the returned `{ system, messages }` to the Claude API.

**No database access.** All data comes in via parameters. The module never imports `convex/server` or reads from any table.

**No streaming logic.** Streaming is handled by the Convex action that calls `assemblePrompt`, not by this module.

## Test coverage

All tests live in `tests/unit/prompts.test.ts`. Since the module is pure, tests import directly from `../../convex/lib/prompts.ts` and use plain Vitest assertions. Tests use unique marker strings (e.g., `"MARKER_B_PRIVATE"`, `"MARKER_A_SYNTHESIS"`) embedded in fixture data so that context isolation can be verified by checking the serialized output does not contain the forbidden markers.

**AC 1 (assemblePrompt signature) -> `tests/unit/prompts.test.ts` (unit).** Call `assemblePrompt` with each of the 4 roles. Assert the return value has `system` (string) and `messages` (array of `PromptMessage`). Verify each message in the array has `role` and `content` fields.

**AC 2 (PRIVATE_COACH isolation) -> `tests/unit/prompts.test.ts` (unit).** Build fixture data with two distinct message sets using unique marker strings for Party A and Party B. Call `assemblePrompt` with `role: "PRIVATE_COACH"` for Party A. Assert: (1) `system` contains the verbatim `PRIVATE_COACH_SYSTEM_PROMPT`, (2) serialized messages contain Party A's markers, (3) serialized `system + messages` does NOT contain any of Party B's marker strings — not their messages, not their form fields, not their synthesis.

**AC 3 (SYNTHESIS anti-quotation) -> `tests/unit/prompts.test.ts` (unit).** Call with `role: "SYNTHESIS"`. Assert: (1) `system` contains the verbatim `ANTI_QUOTATION_INSTRUCTION` substring, (2) `system` contains the JSON output format instruction, (3) messages include content from both parties' private messages.

**AC 4 (COACH context) -> `tests/unit/prompts.test.ts` (unit).** Call with `role: "COACH"`. Assert: (1) serialized output contains both synthesis text markers, (2) serialized output contains joint chat markers, (3) serialized output does NOT contain any raw private message markers from either party, (4) `system` contains the anti-quotation instruction.

**AC 5 (DRAFT_COACH isolation) -> `tests/unit/prompts.test.ts` (unit).** Call with `role: "DRAFT_COACH"` for Party A. Assert: (1) serialized output contains Party A's synthesis marker, (2) serialized output does NOT contain Party B's synthesis marker, (3) serialized output does NOT contain any private message markers from either party.

**AC 6 (template injection) -> `tests/unit/prompts.test.ts` (unit).** Call with `role: "COACH"` and a mock `templateVersion` with known `coachInstructions` text. Assert: `system` contains the template instruction text. Call again without `templateVersion`. Assert: `system` uses baseline only (no template text). Also verify PRIVATE_COACH ignores `templateVersion` even when provided.

**AC 7 (PRIVATE_COACH negative test) -> `tests/unit/prompts.test.ts` (unit).** Explicitly pass other-party data in `context` (private messages, synthesis, form fields — all with unique markers). Call `assemblePrompt` for PRIVATE_COACH. Assert that NONE of the other-party markers appear anywhere in `JSON.stringify({ system, messages })`. This is the defense-in-depth test: even if the caller mistakenly provides other-party data, the function must not include it.
