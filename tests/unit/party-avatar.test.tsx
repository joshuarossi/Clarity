// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PartyAvatar } from "../../src/components/ui/PartyAvatar";

afterEach(cleanup);

// ── AC: PartyAvatar renders 32×32 circles with white initials on party
//    color: initiator = --party-initiator (#6B85A8),
//    invitee = --party-invitee (#B07A8F),
//    coach = --coach-accent (#8B7AB5) per StyleGuide §6.5 ────────────────

describe("AC: PartyAvatar renders circles with white initials on party color", () => {
  describe("sizing", () => {
    it("renders at 32px (md) by default", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Alex" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar).not.toBeNull();
      // Default size is md = 32px — the component should set width/height
      expect(avatar!.getAttribute("style")).toContain("32");
    });

    it("renders at 24px for size sm", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Alex" size="sm" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar).not.toBeNull();
      expect(avatar!.getAttribute("style")).toContain("24");
    });

    it("renders at 40px for size lg", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Alex" size="lg" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar).not.toBeNull();
      expect(avatar!.getAttribute("style")).toContain("40");
    });
  });

  describe("initials derivation", () => {
    it("derives single initial from a single-word name", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Alex" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar!.textContent).toBe("A");
    });

    it("derives two initials from a two-word name", () => {
      const { container } = render(
        <PartyAvatar role="invitee" name="Jordan Smith" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar!.textContent).toBe("JS");
    });

    it("derives first and last initials from a three-word name", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Mary Jane Watson" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar!.textContent).toBe("MW");
    });

    it("uppercases initials", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="alex johnson" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar!.textContent).toBe("AJ");
    });
  });

  describe("party color via CSS custom properties", () => {
    it("initiator uses var(--party-initiator) background", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Alex" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar).not.toBeNull();
      const style = avatar!.getAttribute("style") ?? "";
      expect(style).toContain("--party-initiator");
    });

    it("invitee uses var(--party-invitee) background", () => {
      const { container } = render(
        <PartyAvatar role="invitee" name="Jordan" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      const style = avatar!.getAttribute("style") ?? "";
      expect(style).toContain("--party-invitee");
    });

    it("coach uses var(--coach-accent) background", () => {
      const { container } = render(
        <PartyAvatar role="coach" name="Coach Riley" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      const style = avatar!.getAttribute("style") ?? "";
      expect(style).toContain("--coach-accent");
    });
  });

  describe("white text color for initials", () => {
    it("renders initials in white", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Alex" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      const style = avatar!.getAttribute("style") ?? "";
      // Text color should be white (either "white" or "#fff" or "#ffffff")
      expect(
        style.includes("white") ||
          style.includes("#fff") ||
          style.includes("rgb(255, 255, 255)"),
      ).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("coach with empty name renders sparkle character", () => {
      const { container } = render(<PartyAvatar role="coach" name="" />);
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar!.textContent).toBe("⟡");
    });

    it("uses .cc-avatar CSS class", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Alex" />,
      );
      expect(container.querySelector(".cc-avatar")).not.toBeNull();
    });

    it("accepts an optional className prop", () => {
      const { container } = render(
        <PartyAvatar role="initiator" name="Alex" className="custom" />,
      );
      const avatar = container.querySelector(".cc-avatar");
      expect(avatar!.classList.contains("custom")).toBe(true);
    });
  });
});
