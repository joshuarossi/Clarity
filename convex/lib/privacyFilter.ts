export interface FilterResult {
  passed: boolean;
  matchedSubstring?: string;
}

/**
 * Splits text into tokens on whitespace and punctuation boundaries.
 * All tokens are lowercased for case-insensitive matching.
 * Punctuation characters become separate tokens.
 */
export function tokenize(text: string): string[] {
  // Match sequences of word characters (including apostrophes within words),
  // or sequences of punctuation characters
  const matches = text.match(/[a-zA-Z0-9_']+|[^\s\w]+/g);
  if (!matches) return [];
  return matches.map((t) => t.toLowerCase());
}

const MATCH_THRESHOLD = 8;

/**
 * Checks whether candidateText contains near-verbatim leaks of any
 * otherPartyMessages. A leak is defined as >= 8 consecutive tokens
 * from any single private message appearing in the candidate text.
 *
 * Pure function with no database or Convex runtime dependencies.
 */
export function filterResponse(
  candidateText: string,
  otherPartyMessages: string[],
): FilterResult {
  if (otherPartyMessages.length === 0 || candidateText === "") {
    return { passed: true };
  }

  const candidateTokens = tokenize(candidateText);

  if (candidateTokens.length < MATCH_THRESHOLD) {
    return { passed: true };
  }

  for (const message of otherPartyMessages) {
    const messageTokens = tokenize(message);

    if (messageTokens.length < MATCH_THRESHOLD) {
      continue;
    }

    // For each possible starting position in the message, check if
    // a window of MATCH_THRESHOLD tokens appears in the candidate
    for (let i = 0; i <= messageTokens.length - MATCH_THRESHOLD; i++) {
      const window = messageTokens.slice(i, i + MATCH_THRESHOLD);

      // Search for this window in the candidate tokens
      for (let j = 0; j <= candidateTokens.length - MATCH_THRESHOLD; j++) {
        let match = true;
        for (let k = 0; k < MATCH_THRESHOLD; k++) {
          if (candidateTokens[j + k] !== window[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          return {
            passed: false,
            matchedSubstring: window.join(" "),
          };
        }
      }
    }
  }

  return { passed: true };
}
