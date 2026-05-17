import { describe, it, expect } from "vitest";
import { detectCoachMention } from "../../convex/lib/mentionDetect";

/**
 * WOR-145 AC3: Unit tests for detectCoachMention helper.
 *
 * The regex: /(?:^|\s)@coach\b/i
 * Matches @Coach at word boundary preceded by start-of-string or whitespace.
 */
describe("detectCoachMention", () => {
  describe("positive cases — should detect @Coach mention", () => {
    it("detects @Coach at the start of a message", () => {
      expect(detectCoachMention("@Coach can you summarize?")).toBe(true);
    });

    it("detects @coach lowercase mid-sentence", () => {
      expect(detectCoachMention("hey @coach what do you think")).toBe(true);
    });

    it("detects @COACH uppercase", () => {
      expect(detectCoachMention("@COACH please help")).toBe(true);
    });

    it("detects @Coach with trailing punctuation (comma)", () => {
      expect(detectCoachMention("@Coach, summarize please")).toBe(true);
    });

    it("detects @Coach with trailing punctuation (period)", () => {
      expect(detectCoachMention("Can you help @Coach.")).toBe(true);
    });

    it("detects mixed case @CoAcH", () => {
      expect(detectCoachMention("@CoAcH help us")).toBe(true);
    });

    it("detects @coach after newline", () => {
      expect(detectCoachMention("first line\n@coach second line")).toBe(true);
    });
  });

  describe("negative cases — should NOT detect a mention", () => {
    it("does not match plain message without @", () => {
      expect(detectCoachMention("Hello everyone")).toBe(false);
    });

    it("does not match email-like pattern email@coaching.com", () => {
      expect(detectCoachMention("email@coaching.com")).toBe(false);
    });

    it("does not match email-like pattern coach@example.com", () => {
      expect(detectCoachMention("contact coach@example.com")).toBe(false);
    });

    it("does not match 'the coach said hello' (no @ symbol)", () => {
      expect(detectCoachMention("the coach said hello")).toBe(false);
    });

    it("does not match word containing @coach as substring without boundary (e.g. foo@coachbar)", () => {
      expect(detectCoachMention("foo@coachbar")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(detectCoachMention("")).toBe(false);
    });
  });
});
