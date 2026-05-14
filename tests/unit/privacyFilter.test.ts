import { describe, it, expect } from "vitest";
import {
  filterResponse,
  tokenize,
} from "../../convex/lib/privacyFilter";
import type { FilterResult } from "../../convex/lib/privacyFilter";

/**
 * WOR-100: Privacy response filter tests
 *
 * Pure unit tests — no Convex runtime or convex-test needed.
 * At red state the import from convex/lib/privacyFilter.ts produces TS2307
 * because the module has not been created yet.
 */

// ── Fixture data: realistic private coaching messages ──────────────────

const MESSAGE_10_TOKENS =
  "I feel really frustrated because my partner never listens to me anymore";
// Tokens: ["i", "feel", "really", "frustrated", "because", "my", "partner", "never", "listens", "to", "me", "anymore"]
// 12 tokens

const MESSAGE_SHORT = "I agree";
// 2 tokens — too short to ever trigger a match

const MESSAGE_PUNCTUATION =
  "Wait... really?! That's — honestly — unbelievable!";
// Tokens include punctuation as separate tokens

const MESSAGE_SECOND =
  "She told me that she wants to move out by next month and find a new place";
// 16 tokens

// ── AC 2: Tokenization splits on whitespace and punctuation boundaries ─

describe("tokenize", () => {
  it("splits on whitespace and punctuation boundaries", () => {
    const result = tokenize("Hello, world! How are you?");
    expect(result).toEqual(["hello", ",", "world", "!", "how", "are", "you", "?"]);
  });

  it("collapses multiple whitespace characters", () => {
    const result = tokenize("hello   world\t\tfoo\n\nbar");
    expect(result).toEqual(["hello", "world", "foo", "bar"]);
  });

  it("lowercases all tokens for case-insensitive matching", () => {
    const result = tokenize("HELLO World FoO");
    expect(result).toEqual(["hello", "world", "foo"]);
  });

  it("treats punctuation clusters as separate tokens", () => {
    const result = tokenize("Wait... really?!");
    // Each punctuation character or cluster is its own token
    const result2 = tokenize("that's");
    expect(result2.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeGreaterThan(2);
    // All tokens should be lowercase strings
    for (const token of result) {
      expect(token).toBe(token.toLowerCase());
      expect(token.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array for empty string", () => {
    const result = tokenize("");
    expect(result).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    const result = tokenize("   \t\n  ");
    expect(result).toEqual([]);
  });

  it("handles dashes as separate tokens", () => {
    const result = tokenize("well-known fact");
    // "well", "-", "known", "fact" or similar split
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toContain("well");
    expect(result).toContain("known");
    expect(result).toContain("fact");
  });
});

// ── AC 1: filterResponse returns {passed: boolean, matchedSubstring?: string} ─

describe("filterResponse return type", () => {
  it("returns { passed: true } when no match is found", () => {
    const result: FilterResult = filterResponse(
      "This is completely original content with no overlap",
      [MESSAGE_10_TOKENS],
    );
    expect(result.passed).toBe(true);
    expect(result.matchedSubstring).toBeUndefined();
  });

  it("returns { passed: false, matchedSubstring } when a match is found", () => {
    // Use 8+ consecutive tokens from MESSAGE_10_TOKENS in candidate
    const result: FilterResult = filterResponse(
      "The AI said: I feel really frustrated because my partner never listens to me",
      [MESSAGE_10_TOKENS],
    );
    expect(result.passed).toBe(false);
    expect(result.matchedSubstring).toBeDefined();
    expect(typeof result.matchedSubstring).toBe("string");
    expect(result.matchedSubstring!.length).toBeGreaterThan(0);
  });
});

// ── AC 3: A match is >=8 consecutive tokens from a single private message ─

describe("8-token threshold", () => {
  it("fails when exactly 8 consecutive tokens from a message appear in candidate", () => {
    // Extract exactly 8 consecutive tokens from MESSAGE_10_TOKENS:
    // "i feel really frustrated because my partner never"
    const candidateWith8 =
      "Some preamble then I feel really frustrated because my partner never and then more text";
    const result = filterResponse(candidateWith8, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(false);
    expect(result.matchedSubstring).toBeDefined();
  });

  it("passes when only 7 consecutive tokens from a message appear in candidate", () => {
    // Only 7 tokens: "I feel really frustrated because my partner"
    const candidateWith7 =
      "Some preamble then I feel really frustrated because my partner and then different text";
    const result = filterResponse(candidateWith7, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(true);
  });

  it("fails when more than 8 consecutive tokens match", () => {
    // All 12 tokens from MESSAGE_10_TOKENS
    const candidateWithAll =
      "The response was: I feel really frustrated because my partner never listens to me anymore, said the client";
    const result = filterResponse(candidateWithAll, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(false);
  });
});

// ── AC 4: Vitest suite - exact 8, 7, paraphrased, empty, multiple ─────

describe("core filter scenarios", () => {
  it("exact 8-token match: passed is false", () => {
    const candidate =
      "I feel really frustrated because my partner never listens";
    const result = filterResponse(candidate, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(false);
  });

  it("7-token match: passed is true", () => {
    const candidate =
      "I feel really frustrated because my partner goes fishing";
    const result = filterResponse(candidate, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(true);
  });

  it("paraphrased content with same meaning but different words: passed is true", () => {
    const candidate =
      "My significant other does not pay attention to what I say and it makes me upset";
    const result = filterResponse(candidate, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(true);
  });

  it("empty otherPartyMessages array: passed is true", () => {
    const result = filterResponse("Any candidate text here", []);
    expect(result.passed).toBe(true);
  });

  it("multiple messages: each checked independently, match in second message triggers failure", () => {
    const candidate =
      "She told me that she wants to move out by next month and find a new place";
    const result = filterResponse(candidate, [
      MESSAGE_SHORT,
      MESSAGE_SECOND,
    ]);
    expect(result.passed).toBe(false);
  });

  it("multiple messages: no match across any message means pass", () => {
    const candidate = "The weather is nice today and I enjoyed my walk";
    const result = filterResponse(candidate, [
      MESSAGE_10_TOKENS,
      MESSAGE_SECOND,
    ]);
    expect(result.passed).toBe(true);
  });

  it("tokens must come from a single message, not split across messages", () => {
    // 4 tokens from MESSAGE_10_TOKENS + 4 tokens from MESSAGE_SECOND
    // should NOT combine to form an 8-token match
    const candidate =
      "I feel really frustrated she wants to move out";
    const result = filterResponse(candidate, [
      MESSAGE_10_TOKENS,
      MESSAGE_SECOND,
    ]);
    expect(result.passed).toBe(true);
  });
});

// ── AC 5: Adversarial test cases ───────────────────────────────────────

describe("adversarial cases", () => {
  it("quoted text with one word substituted in the middle of an 8-token run: passed is true", () => {
    // Original: "I feel really frustrated because my partner never"
    // Substitute "frustrated" with "angry" — breaks the consecutive run
    const candidate =
      "I feel really angry because my partner never listens";
    const result = filterResponse(candidate, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(true);
  });

  it("verbatim copy-paste of 10+ tokens: passed is false", () => {
    const candidate =
      "They said: I feel really frustrated because my partner never listens to me anymore";
    const result = filterResponse(candidate, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(false);
  });

  it("case variation — all-caps copy of original: passed is false (case-insensitive)", () => {
    const candidate =
      "I FEEL REALLY FRUSTRATED BECAUSE MY PARTNER NEVER LISTENS TO ME ANYMORE";
    const result = filterResponse(candidate, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(false);
  });

  it("mixed case variation: passed is false", () => {
    const candidate =
      "i Feel Really Frustrated Because My Partner Never Listens To Me Anymore";
    const result = filterResponse(candidate, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(false);
  });
});

// ── Edge cases from contract ───────────────────────────────────────────

describe("edge cases", () => {
  it("empty candidate text: passed is true", () => {
    const result = filterResponse("", [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(true);
  });

  it("very short messages (fewer than 8 tokens) can never trigger a match", () => {
    // MESSAGE_SHORT is "I agree" — only 2 tokens
    const candidate = "I agree with everything you said, I agree completely";
    const result = filterResponse(candidate, [MESSAGE_SHORT]);
    expect(result.passed).toBe(true);
  });

  it("punctuation-heavy content is tokenized with punctuation as separate tokens", () => {
    // MESSAGE_PUNCTUATION has many punctuation tokens, making 8-consecutive-word matches harder
    const candidate = "Wait... really?! That's — honestly — unbelievable!";
    const result = filterResponse(candidate, [MESSAGE_PUNCTUATION]);
    // This IS a verbatim copy, so it should fail
    expect(result.passed).toBe(false);
  });

  it("returns on first match found across multiple messages", () => {
    // Both messages have verbatim content in candidate
    const candidate =
      "I feel really frustrated because my partner never listens to me anymore. " +
      "She told me that she wants to move out by next month and find a new place.";
    const result = filterResponse(candidate, [
      MESSAGE_10_TOKENS,
      MESSAGE_SECOND,
    ]);
    expect(result.passed).toBe(false);
    // matchedSubstring should be from the first match
    expect(result.matchedSubstring).toBeDefined();
  });

  it("single occurrence in candidate is enough to fail", () => {
    const candidate =
      "prefix I feel really frustrated because my partner never listens suffix";
    const result = filterResponse(candidate, [MESSAGE_10_TOKENS]);
    expect(result.passed).toBe(false);
  });
});

// ── AC 6: Module purity ────────────────────────────────────────────────

describe("module purity", () => {
  it("filterResponse is a synchronous function (not async)", () => {
    const result = filterResponse("test", []);
    // If filterResponse were async, result would be a Promise
    // A sync result is not a Promise (no .then method)
    expect(result).toHaveProperty("passed");
    expect(typeof (result as { then?: unknown }).then).not.toBe("function");
  });

  it("tokenize is a synchronous function (not async)", () => {
    const result = tokenize("hello world");
    expect(Array.isArray(result)).toBe(true);
    expect(typeof (result as { then?: unknown }).then).not.toBe("function");
  });
});
