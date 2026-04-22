// ---------------------------------------------------------------------------
// Unit tests for the Phase 2a.0 block renderers.
//
// Server-component renderers are pure functions of their props — no
// client hooks, no fetching. We can render each to HTML via
// `react-dom/server` and assert on the string.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeadingBlockRenderer } from "./heading.server";
import { ParagraphBlockRenderer } from "./paragraph.server";
import { PlaceholderBlockRenderer } from "./placeholder.server";

describe("HeadingBlockRenderer", () => {
  it("renders <h1> with data attributes when level is 1", () => {
    const html = renderToStaticMarkup(
      <HeadingBlockRenderer id="B1" content={{ level: 1, text: "Title" }} />,
    );
    expect(html).toContain("<h1");
    expect(html).toContain('data-block-id="B1"');
    expect(html).toContain('data-block-type="heading"');
    expect(html).toContain("Title");
  });

  it("renders <h2> when level is 2", () => {
    const html = renderToStaticMarkup(
      <HeadingBlockRenderer id="B2" content={{ level: 2, text: "Sub" }} />,
    );
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h1");
  });

  it("renders <h3> when level is 3", () => {
    const html = renderToStaticMarkup(
      <HeadingBlockRenderer id="B3" content={{ level: 3, text: "Sub" }} />,
    );
    expect(html).toContain("<h3");
  });

  it("falls back to <h1> for an invalid level", () => {
    const html = renderToStaticMarkup(
      <HeadingBlockRenderer id="B4" content={{ level: 9, text: "Bad" }} />,
    );
    expect(html).toContain("<h1");
  });

  it("truncates text at 200 chars", () => {
    const long = "a".repeat(500);
    const html = renderToStaticMarkup(
      <HeadingBlockRenderer id="B5" content={{ level: 1, text: long }} />,
    );
    // 200 'a's inside the tag.
    expect(html).toContain("a".repeat(200));
    expect(html).not.toContain("a".repeat(201));
  });
});

describe("ParagraphBlockRenderer", () => {
  it("renders plain text inside <p>", () => {
    const html = renderToStaticMarkup(
      <ParagraphBlockRenderer id="P1" content={{ text: "Hello world" }} />,
    );
    expect(html).toContain("<p");
    expect(html).toContain('data-block-id="P1"');
    expect(html).toContain("Hello world");
  });

  it("wraps a bold range in <strong>", () => {
    const html = renderToStaticMarkup(
      <ParagraphBlockRenderer
        id="P2"
        content={{
          text: "Hello world",
          inline_formatting: [{ start: 0, end: 5, type: "bold" }],
        }}
      />,
    );
    expect(html).toContain("<strong>Hello</strong>");
    expect(html).toContain(" world");
  });

  it("wraps an italic range in <em>", () => {
    const html = renderToStaticMarkup(
      <ParagraphBlockRenderer
        id="P3"
        content={{
          text: "Hello world",
          inline_formatting: [{ start: 6, end: 11, type: "italic" }],
        }}
      />,
    );
    expect(html).toContain("<em>world</em>");
  });

  it("renders a link with target _blank and rel noopener noreferrer", () => {
    const html = renderToStaticMarkup(
      <ParagraphBlockRenderer
        id="P4"
        content={{
          text: "See the docs here",
          inline_formatting: [
            {
              start: 13,
              end: 17,
              type: "link",
              url: "https://example.test",
            },
          ],
        }}
      />,
    );
    expect(html).toContain('href="https://example.test"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">here</a>");
  });

  it("renders inline code in <code>", () => {
    const html = renderToStaticMarkup(
      <ParagraphBlockRenderer
        id="P5"
        content={{
          text: "Use foo() always",
          inline_formatting: [{ start: 4, end: 9, type: "code" }],
        }}
      />,
    );
    expect(html).toMatch(/<code[^>]*>foo\(\)<\/code>/);
  });

  it("composes overlapping bold + italic marks", () => {
    const html = renderToStaticMarkup(
      <ParagraphBlockRenderer
        id="P6"
        content={{
          text: "abcd",
          inline_formatting: [
            { start: 0, end: 4, type: "bold" },
            { start: 1, end: 3, type: "italic" },
          ],
        }}
      />,
    );
    // middle segment should have both strong and em.
    expect(html).toMatch(/<strong>a<\/strong>/);
    expect(html).toMatch(/<strong><em>bc<\/em><\/strong>/);
    expect(html).toMatch(/<strong>d<\/strong>/);
  });

  it("ignores malformed marks (missing url, inverted ranges)", () => {
    const html = renderToStaticMarkup(
      <ParagraphBlockRenderer
        id="P7"
        content={{
          text: "Hello",
          inline_formatting: [
            // Inverted
            { start: 4, end: 1, type: "bold" },
            // Out of range
            { start: 0, end: 99, type: "italic" },
            // Missing url
            { start: 0, end: 2, type: "link" },
            // Unknown type
            { start: 0, end: 1, type: "banana" as unknown as "bold" },
          ] as never,
        }}
      />,
    );
    expect(html).toContain("Hello");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("<a ");
  });

  it("truncates text at 10,000 chars", () => {
    const long = "a".repeat(12_000);
    const html = renderToStaticMarkup(
      <ParagraphBlockRenderer id="P8" content={{ text: long }} />,
    );
    expect(html).toContain("a".repeat(10_000));
    expect(html).not.toContain("a".repeat(10_001));
  });
});

describe("PlaceholderBlockRenderer", () => {
  it("renders an empty aria-hidden div with data attributes", () => {
    const html = renderToStaticMarkup(
      <PlaceholderBlockRenderer id="X1" type="chart" />,
    );
    expect(html).toContain('data-block-type="chart"');
    expect(html).toContain('data-block-id="X1"');
    expect(html).toContain('aria-hidden="true"');
    // No text content visible.
    expect(html).toMatch(/><\/div>$/);
  });
});
