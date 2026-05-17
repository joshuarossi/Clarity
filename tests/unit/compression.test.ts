import { describe, it, expect, vi } from "vitest";
import {
  compressTranscript,
  estimateTokens,
  COMPRESSION_PROMPT,
} from "../../convex/lib/compression";
import type { CompressibleMessage } from "../../convex/lib/compression";

/**
 * WOR-101: Transcript compression module tests
 *
 * Pure unit tests — no Convex runtime or convex-test needed.
 * The module is async (calls Anthropic Haiku) but has no Convex
 * runtime dependencies. Tests use a mock Anthropic client.
 *
 * At red state the import from convex/lib/compression.ts produces TS2307
 * because the module has not been created yet.
 */

// ── Mock Anthropic client ──────────────────────────────────────────────

interface MockCreateParams {
  model: string;
  max_tokens: number;
  messages: Array<{ role: string; content: string }>;
}

function createMockClient(summaryText: string) {
  const createFn =
    vi.fn<
      (
        params: MockCreateParams,
      ) => Promise<{ content: Array<{ text: string }> }>
    >();
  createFn.mockResolvedValue({
    content: [{ text: summaryText }],
  });

  return {
    client: { messages: { create: createFn } },
    createFn,
  };
}

// ── Fixture helpers ────────────────────────────────────────────────────

function makeMessages(count: number, wordsPer: number): CompressibleMessage[] {
  const result: CompressibleMessage[] = [];
  for (let i = 0; i < count; i++) {
    const words = Array.from(
      { length: wordsPer },
      (_, w) => `word${i}_${w}`,
    ).join(" ");
    result.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: words,
    });
  }
  return result;
}

// ── AC 5 (partial): estimateTokens utility ─────────────────────────────

describe("estimateTokens", () => {
  it("returns 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns a positive number for non-empty strings", () => {
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
  });

  it("produces a reasonable estimate (word count / 0.75 heuristic)", () => {
    // "hello world" = 2 words → 2 / 0.75 ≈ 2.67
    const estimate = estimateTokens("hello world");
    expect(estimate).toBeGreaterThanOrEqual(2);
    expect(estimate).toBeLessThanOrEqual(5);
  });

  it("scales with input length", () => {
    const short = estimateTokens("one two");
    const long = estimateTokens("one two three four five six seven eight");
    expect(long).toBeGreaterThan(short);
  });
});

// ── AC 1: Under budget → pass-through ──────────────────────────────────

describe("AC 1: messages under budget are returned unchanged", () => {
  it("returns the input array unchanged (deep equality) when under budget", async () => {
    const messages = makeMessages(3, 5);
    const { client, createFn } = createMockClient("should not be called");

    // Use a very large budget so messages fit easily
    const result = await compressTranscript(messages, 100_000, {
      client,
    });

    expect(result).toEqual(messages);
    expect(createFn).not.toHaveBeenCalled();
  });

  it("returns an empty array unchanged", async () => {
    const { client, createFn } = createMockClient("should not be called");

    const result = await compressTranscript([], 1000, { client });

    expect(result).toEqual([]);
    expect(createFn).not.toHaveBeenCalled();
  });

  it("returns messages unchanged when exactly at budget", async () => {
    const messages: CompressibleMessage[] = [
      { role: "user", content: "hello world test" },
    ];
    const totalTokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );
    const { client, createFn } = createMockClient("should not be called");

    const result = await compressTranscript(messages, totalTokens, {
      client,
    });

    expect(result).toEqual(messages);
    expect(createFn).not.toHaveBeenCalled();
  });
});

// ── AC 2: Over budget → compression ────────────────────────────────────

describe("AC 2: messages over budget are compressed", () => {
  const CANNED_SUMMARY = "This is a canned summary of the conversation.";

  it("replaces the oldest 50% with a single SUMMARY message", async () => {
    const messages = makeMessages(4, 50);
    const { client, createFn } = createMockClient(CANNED_SUMMARY);

    const result = await compressTranscript(messages, 1, { client });

    // Math.ceil(4/2) = 2 oldest messages replaced, 2 newest kept
    // Result: [SUMMARY, messages[2], messages[3]]
    expect(result.length).toBe(3);

    // First element is the SUMMARY message
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("SUMMARY:");
    expect(result[0].content).toContain(CANNED_SUMMARY);

    // Newest messages are preserved in order
    expect(result[1]).toEqual(messages[2]);
    expect(result[2]).toEqual(messages[3]);

    // Haiku called exactly once
    expect(createFn).toHaveBeenCalledTimes(1);
  });

  it("handles odd number of messages (compresses the larger half)", async () => {
    const messages = makeMessages(5, 50);
    const { client } = createMockClient(CANNED_SUMMARY);

    const result = await compressTranscript(messages, 1, { client });

    // Math.ceil(5/2) = 3 oldest compressed, 2 newest kept
    // Result: [SUMMARY, messages[3], messages[4]]
    expect(result.length).toBe(3);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("SUMMARY:");
    expect(result[1]).toEqual(messages[3]);
    expect(result[2]).toEqual(messages[4]);
  });

  it("handles two messages over budget (compresses first, keeps second)", async () => {
    const messages = makeMessages(2, 50);
    const { client } = createMockClient(CANNED_SUMMARY);

    const result = await compressTranscript(messages, 1, { client });

    // Math.ceil(2/2) = 1 compressed, 1 kept
    expect(result.length).toBe(2);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("SUMMARY:");
    expect(result[1]).toEqual(messages[1]);
  });

  it("handles single message over budget (entire array becomes SUMMARY)", async () => {
    const messages = makeMessages(1, 50);
    const { client } = createMockClient(CANNED_SUMMARY);

    const result = await compressTranscript(messages, 1, { client });

    // Math.ceil(1/2) = 1 compressed, 0 kept
    expect(result.length).toBe(1);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("SUMMARY:");
    expect(result[0].content).toContain(CANNED_SUMMARY);
  });

  it("SUMMARY message content is prefixed with 'SUMMARY: '", async () => {
    const messages = makeMessages(4, 50);
    const { client } = createMockClient(CANNED_SUMMARY);

    const result = await compressTranscript(messages, 1, { client });

    expect(result[0].content.startsWith("SUMMARY: ")).toBe(true);
  });
});

// ── AC 3: Prompt fidelity ──────────────────────────────────────────────

describe("AC 3: Haiku compression prompt matches TechSpec §6.4", () => {
  const EXPECTED_PROMPT =
    "Summarize this conversation segment in 500 tokens or fewer, preserving facts, decisions, emotional tone, and unresolved threads.";

  it("COMPRESSION_PROMPT constant equals the exact §6.4 wording", () => {
    expect(COMPRESSION_PROMPT).toBe(EXPECTED_PROMPT);
  });

  it("sends the exact prompt to the Haiku API when compressing", async () => {
    const messages = makeMessages(4, 50);
    const { client, createFn } = createMockClient("summary");

    await compressTranscript(messages, 1, { client });

    expect(createFn).toHaveBeenCalledTimes(1);
    const callArgs = createFn.mock.calls[0][0];

    // The prompt should appear in the API call (as system instruction or in messages)
    const allContent = JSON.stringify(callArgs);
    expect(allContent).toContain(EXPECTED_PROMPT);
  });

  it("calls the Haiku model specifically", async () => {
    const messages = makeMessages(4, 50);
    const { client, createFn } = createMockClient("summary");

    await compressTranscript(messages, 1, { client });

    const callArgs = createFn.mock.calls[0][0];
    expect(callArgs.model).toContain("haiku");
  });
});

// ── AC 4: Cache hit ────────────────────────────────────────────────────

describe("AC 4: summaries are cached by content hash", () => {
  it("second call with same messages returns cached result without API call", async () => {
    // Use unique wordsPer (30) to avoid cache pollution from AC 2/3 tests
    const messages = makeMessages(4, 30);
    const { client, createFn } = createMockClient("cached summary");

    const result1 = await compressTranscript(messages, 1, { client });
    const result2 = await compressTranscript(messages, 1, { client });

    // Haiku called only once — second call uses cache
    expect(createFn).toHaveBeenCalledTimes(1);

    // Both results are deeply equal
    expect(result2).toEqual(result1);
  });

  it("different messages produce separate cache entries and separate API calls", async () => {
    // Use unique wordsPer (35) to avoid cache pollution from AC 2/3 tests
    const messagesA = makeMessages(4, 35);
    const messagesB: CompressibleMessage[] = [
      {
        role: "user",
        content: "completely different conversation content alpha",
      },
      {
        role: "assistant",
        content: "completely different response content beta",
      },
      { role: "user", content: "completely different followup content gamma" },
      {
        role: "assistant",
        content: "completely different closing content delta",
      },
    ];
    const { client, createFn } = createMockClient("summary");

    await compressTranscript(messagesA, 1, { client });
    await compressTranscript(messagesB, 1, { client });

    // Two different message sets → two API calls
    expect(createFn).toHaveBeenCalledTimes(2);
  });
});

// ── AC 5: Comprehensive suite (meta-requirement) ──────────────────────

describe("AC 5: comprehensive Vitest suite", () => {
  it("compressed result contains the Haiku-generated summary text", async () => {
    const summaryText =
      "Important decisions were made about project direction.";
    const messages = makeMessages(6, 50);
    const { client } = createMockClient(summaryText);

    const result = await compressTranscript(messages, 1, { client });

    expect(result[0].content).toContain(summaryText);
  });

  it("newest messages are preserved in their original order after compression", async () => {
    const messages = makeMessages(6, 50);
    const { client } = createMockClient("summary");

    const result = await compressTranscript(messages, 1, { client });

    // Math.ceil(6/2) = 3 compressed, 3 kept
    // Newest: messages[3], messages[4], messages[5]
    expect(result[1]).toEqual(messages[3]);
    expect(result[2]).toEqual(messages[4]);
    expect(result[3]).toEqual(messages[5]);
  });

  it("does not mutate the original message array", async () => {
    const messages = makeMessages(4, 50);
    const originalCopy = messages.map((m) => ({ ...m }));
    const { client } = createMockClient("summary");

    await compressTranscript(messages, 1, { client });

    expect(messages).toEqual(originalCopy);
  });
});
