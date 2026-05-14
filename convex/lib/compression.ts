import { createHash } from "crypto";

export interface CompressibleMessage {
  role: string;
  content: string;
}

export type CompressResult = CompressibleMessage[];

export const COMPRESSION_PROMPT =
  "Summarize this conversation segment in 500 tokens or fewer, preserving facts, decisions, emotional tone, and unresolved threads.";

interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    }): Promise<{ content: Array<{ text: string }> }>;
  };
}

/**
 * Approximates token count for a string using a word-count heuristic.
 * Splits on whitespace, divides by 0.75 to approximate Claude tokenization.
 * Slightly overestimates, which is safe — triggers compression earlier rather
 * than risking budget overruns.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return Math.ceil(words.length / 0.75);
}

const summaryCache = new Map<string, string>();

export function resetSummaryCache(): void {
  summaryCache.clear();
}

function hashContent(messages: CompressibleMessage[]): string {
  const concatenated = messages.map((m) => m.content).join("\n");
  return createHash("sha256").update(concatenated).digest("hex");
}

/**
 * Compresses a message array to fit within a token budget.
 * If total tokens are within budget, returns messages unchanged.
 * Otherwise, replaces the oldest 50% with a Haiku-generated summary.
 */
export async function compressTranscript(
  messages: CompressibleMessage[],
  budgetTokens: number,
  options?: { client?: AnthropicClient },
): Promise<CompressibleMessage[]> {
  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );

  if (totalTokens <= budgetTokens) {
    return messages;
  }

  const splitIndex = Math.ceil(messages.length / 2);
  const oldestHalf = messages.slice(0, splitIndex);
  const newestHalf = messages.slice(splitIndex);

  const hash = hashContent(oldestHalf);
  const cached = summaryCache.get(hash);

  if (cached) {
    const summaryMessage: CompressibleMessage = {
      role: "system",
      content: `SUMMARY: ${cached}`,
    };
    return [summaryMessage, ...newestHalf];
  }

  if (!options?.client) {
    throw new Error(
      "Anthropic client is required for compression but was not provided",
    );
  }

  const conversationText = oldestHalf
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await options.client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `${COMPRESSION_PROMPT}\n\n${conversationText}`,
      },
    ],
  });

  const summaryText = response.content[0].text;
  summaryCache.set(hash, summaryText);

  const summaryMessage: CompressibleMessage = {
    role: "system",
    content: `SUMMARY: ${summaryText}`,
  };

  return [summaryMessage, ...newestHalf];
}
