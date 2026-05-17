/**
 * Detects whether a message contains an @-mention of the Coach.
 * Case-insensitive, requires whitespace or start-of-string before the @.
 */
export function detectCoachMention(content: string): boolean {
  return /(?:^|\s)@coach\b/i.test(content);
}
