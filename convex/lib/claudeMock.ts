/**
 * Server-side Claude mock module.
 *
 * When CLAUDE_MOCK=true, Convex actions that call the Claude API should
 * route to this module instead of the real Anthropic SDK.
 * Provides deterministic canned responses per PromptRole for E2E testing.
 *
 * Implements TechSpec §10.4.
 */

import type { PromptRole } from "./prompts";

// ---------------------------------------------------------------------------
// Mock responses — deterministic, realistic content per role
// ---------------------------------------------------------------------------

const MOCK_RESPONSES: Record<PromptRole, string> = {
  PRIVATE_COACH: `## Reflecting on Your Perspective

Thank you for sharing that with me. It sounds like this situation has been weighing on you, and I appreciate your willingness to explore it.

A few things stand out from what you've described:

- You feel unheard when decisions are made without your input
- There's a pattern of miscommunication around expectations
- You genuinely want to find a resolution that works for both of you

### Some Questions to Consider

1. **What would "being heard" look like for you in practice?** Is it about being consulted before decisions, or is it more about acknowledgment of your feelings?
2. **When you imagine the best possible outcome, what does that conversation sound like?**
3. **What do you think the other person's biggest concern might be?**

Take your time with these. There's no rush to have all the answers right now. The goal is to help you feel prepared and grounded before you communicate with the other party.`,

  // NOTE: The COACH mock text intentionally omits the period after "conversation" and
  // uses "you have" instead of "you've" so that privacy filter tests can seed private
  // message content matching 8+ consecutive tokens against this response.
  COACH: `## Joint Session Summary

Thank you both for joining this conversation I can see you have each put thought into understanding the situation, which is a strong foundation.

**What I'm hearing from both of you:**
- There's a shared desire to resolve this constructively
- Each of you has concerns about feeling respected in the process
- You both value the relationship and want to move forward

**Areas where you seem aligned:**
- The importance of clear communication going forward
- A willingness to establish new patterns for decision-making
- Recognition that past miscommunications weren't intentional

### Suggested Next Steps

I'd encourage you both to take turns sharing one specific, actionable change you'd like to see. Focus on future behavior rather than past grievances.

Who would like to go first?`,

  DRAFT_COACH: `## Draft Message Feedback

Here's a refined version of your message that maintains your intent while adjusting the tone for clarity:

---

*"I'd like to talk about how we handle decisions that affect both of us. I've noticed that sometimes I feel left out of the process, and I think establishing a simple check-in habit could help us both feel more included. Would you be open to discussing what that might look like?"*

---

### Tone Notes

- **What works well:** Your message is direct without being accusatory. Using "I" statements keeps the focus on your experience.
- **Consider softening:** The opening could include an acknowledgment of their perspective to signal collaborative intent.
- **Avoid:** Phrases like "you always" or "you never" — they tend to trigger defensiveness even when accurate.

Would you like me to adjust anything about this draft?`,

  SYNTHESIS: JSON.stringify(
    {
      forInitiator:
        "Based on both perspectives, there are several areas of alignment: you both want clearer communication and mutual respect in decision-making. The key disagreement centers on how much advance consultation is needed before making changes that affect shared responsibilities. Your partner seems to value efficiency and may not realize how excluded you feel. A suggested approach for the joint session: lead with your shared goal of improving communication, then propose a specific check-in process rather than discussing past incidents.",
      forInvitee:
        "Based on both perspectives, there are several areas of alignment: you both want clearer communication and mutual respect in decision-making. The main tension is around expectations for consultation before decisions. Your partner feels left out of the process and values being included, even for smaller choices. This doesn't mean every decision needs approval — it's about acknowledgment. A suggested approach for the joint session: listen for the underlying need (inclusion, not control) and propose a lightweight check-in that works for both of your schedules.",
    },
    null,
    2,
  ),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true when the CLAUDE_MOCK environment variable is set to "true".
 * Convex actions should check this before calling the Anthropic SDK.
 */
export function isClaudeMockEnabled(): boolean {
  return process.env.CLAUDE_MOCK === "true";
}

/**
 * Returns a deterministic canned response string for the given prompt role.
 * The response is always the same for a given role — no randomness.
 */
export function getMockClaudeResponse(role: PromptRole): string {
  return MOCK_RESPONSES[role];
}

/**
 * Configurable mock streaming delay in milliseconds.
 * Reads from CLAUDE_MOCK_DELAY_MS env var, defaults to 100.
 */
export const MOCK_DELAY_MS: number = (() => {
  const raw = process.env.CLAUDE_MOCK_DELAY_MS;
  if (raw === undefined) return 100;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 100;
})();
