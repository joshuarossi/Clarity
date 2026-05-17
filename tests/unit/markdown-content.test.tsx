// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MarkdownContent } from "../../src/components/chat/MarkdownContent";

afterEach(cleanup);

// ── AC1: Coach messages containing markdown syntax render as formatted HTML ──

describe("AC1: MarkdownContent renders markdown as formatted HTML elements", () => {
  it("renders ### heading as <h3>", () => {
    const { container } = render(<MarkdownContent content="### Heading" />);
    const h3 = container.querySelector("h3");
    expect(h3).not.toBeNull();
    expect(h3!.textContent).toBe("Heading");
  });

  it("renders **bold** as <strong>", () => {
    const { container } = render(<MarkdownContent content="**bold**" />);
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe("bold");
  });

  it("renders *italic* as <em>", () => {
    const { container } = render(<MarkdownContent content="*italic*" />);
    const em = container.querySelector("em");
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe("italic");
  });

  it("renders - list item as <ul><li>", () => {
    const { container } = render(<MarkdownContent content="- list item" />);
    const li = container.querySelector("ul > li");
    expect(li).not.toBeNull();
    expect(li!.textContent).toBe("list item");
  });

  it("renders 1. ordered item as <ol><li>", () => {
    const { container } = render(<MarkdownContent content="1. ordered item" />);
    const li = container.querySelector("ol > li");
    expect(li).not.toBeNull();
    expect(li!.textContent).toBe("ordered item");
  });

  it("renders blank lines as paragraph breaks", () => {
    const { container } = render(
      <MarkdownContent content={"First paragraph\n\nSecond paragraph"} />,
    );
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(paragraphs[0].textContent).toContain("First paragraph");
    expect(paragraphs[1].textContent).toContain("Second paragraph");
  });

  it("renders plain text without markdown as a <p> element", () => {
    const { container } = render(<MarkdownContent content="Just plain text" />);
    const p = container.querySelector("p");
    expect(p).not.toBeNull();
    expect(p!.textContent).toBe("Just plain text");
  });

  it("renders empty content without crashing", () => {
    const { container } = render(<MarkdownContent content="" />);
    expect(container).not.toBeNull();
  });
});

// ── AC3: Markdown rendering sanitizes HTML to prevent XSS ──

describe("AC3: MarkdownContent sanitizes HTML to prevent XSS", () => {
  it("does not render <script> tags as live DOM elements", () => {
    const { container } = render(
      <MarkdownContent content={'<script>alert("xss")</script>'} />,
    );
    const script = container.querySelector("script");
    expect(script).toBeNull();
  });

  it("does not render <img> with onerror as live DOM element", () => {
    const { container } = render(
      <MarkdownContent content={"<img src=x onerror=alert(1)>"} />,
    );
    expect(container.innerHTML).not.toContain("<img");
  });

  it("displays raw HTML as escaped text", () => {
    const { container } = render(
      <MarkdownContent content={'<script>alert("xss")</script>'} />,
    );
    expect(container.textContent).toContain("<script>");
  });

  it("does not use dangerouslySetInnerHTML (no raw HTML injection)", () => {
    const { container } = render(
      <MarkdownContent content={'<div onclick="alert(1)">click me</div>'} />,
    );
    const div = container.querySelector("[onclick]");
    expect(div).toBeNull();
  });
});
