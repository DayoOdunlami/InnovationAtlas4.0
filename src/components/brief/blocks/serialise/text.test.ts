// ---------------------------------------------------------------------------
// Round-trip tests for the Plate ↔ projection serialiser (Phase 2a.1).
//
// The contract: Plate-editable trees and stored projections must be
// isomorphic up to normalisation (adjacent same-type marks merged,
// trailing empty items trimmed). The property test below generates
// 1000 random paragraph mark configurations and asserts the round-trip
// is stable.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import type {
  BulletsContent,
  HeadingContent,
  ParagraphContent,
  ParagraphInlineMark,
} from "../types";
import {
  bulletsToPlate,
  headingToPlate,
  paragraphToPlate,
  plateToBullets,
  plateToHeading,
  plateToParagraph,
} from "./text";

describe("heading serialiser", () => {
  it.each([1, 2, 3] as const)("round-trips level %i", (level) => {
    const p: HeadingContent = { level, text: `My ${level} heading` };
    expect(plateToHeading(headingToPlate(p))).toEqual(p);
  });

  it("clamps text to 200 chars", () => {
    const p: HeadingContent = { level: 1, text: "a".repeat(500) };
    const out = plateToHeading(headingToPlate(p));
    expect(out.text.length).toBe(200);
  });
});

describe("paragraph serialiser", () => {
  it("round-trips plain text", () => {
    const p: ParagraphContent = { text: "Hello world" };
    expect(plateToParagraph(paragraphToPlate(p))).toEqual({
      text: "Hello world",
    });
  });

  it("round-trips a bold range", () => {
    const p: ParagraphContent = {
      text: "Hello world",
      inline_formatting: [{ start: 0, end: 5, type: "bold" }],
    };
    expect(plateToParagraph(paragraphToPlate(p))).toEqual(p);
  });

  it("round-trips a link range", () => {
    const p: ParagraphContent = {
      text: "See the docs here",
      inline_formatting: [
        { start: 13, end: 17, type: "link", url: "https://example.test" },
      ],
    };
    const out = plateToParagraph(paragraphToPlate(p));
    expect(out.text).toBe(p.text);
    expect(out.inline_formatting).toEqual(p.inline_formatting);
  });

  it("round-trips overlapping bold + italic", () => {
    const p: ParagraphContent = {
      text: "abcd",
      inline_formatting: [
        { start: 0, end: 4, type: "bold" },
        { start: 1, end: 3, type: "italic" },
      ],
    };
    const out = plateToParagraph(paragraphToPlate(p));
    expect(out.text).toBe("abcd");
    const sorted = [...(out.inline_formatting ?? [])].sort(
      (a, b) => a.start - b.start || a.type.localeCompare(b.type),
    );
    expect(sorted).toEqual([
      { start: 0, end: 4, type: "bold" },
      { start: 1, end: 3, type: "italic" },
    ]);
  });

  // Property test: 1000 random configs of non-overlapping marks.
  it("property: 1000 random mark configs round-trip stably", () => {
    const rng = seededRng(1234);
    for (let iter = 0; iter < 1000; iter += 1) {
      const length = 1 + Math.floor(rng() * 40);
      const text = randomText(rng, length);
      const marks = randomMarks(rng, length);
      const projection: ParagraphContent = {
        text,
        ...(marks.length > 0 ? { inline_formatting: marks } : {}),
      };
      const once = plateToParagraph(paragraphToPlate(projection));
      const twice = plateToParagraph(paragraphToPlate(once));
      expect(twice).toEqual(once);
      expect(once.text).toBe(text);
    }
  });
});

describe("bullets serialiser", () => {
  it("round-trips a simple bullet list", () => {
    const p: BulletsContent = {
      style: "bullet",
      items: ["a", "b", "c"],
      indent: [0, 1, 2],
    };
    expect(plateToBullets(bulletsToPlate(p))).toEqual(p);
  });

  it("round-trips a numbered list with trimmed trailing blanks", () => {
    const p: BulletsContent = {
      style: "numbered",
      items: ["x", "y", ""],
      indent: [0, 0, 0],
    };
    const out = plateToBullets(bulletsToPlate(p));
    expect(out).toEqual({
      style: "numbered",
      items: ["x", "y"],
      indent: [0, 0],
    });
  });

  it("clamps indent to {0,1,2}", () => {
    const node = bulletsToPlate({
      style: "bullet",
      items: ["x"],
      indent: [5],
    });
    expect(node.children[0].indent).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test helpers — deterministic RNG so CI is stable.
// ---------------------------------------------------------------------------

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const ALPHA = "abcdefghijklmnopqrstuvwxyz ";

function randomText(rng: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHA[Math.floor(rng() * ALPHA.length)];
  }
  return out;
}

function randomMarks(
  rng: () => number,
  textLength: number,
): ParagraphInlineMark[] {
  const n = Math.floor(rng() * 4);
  const marks: ParagraphInlineMark[] = [];
  const types: ParagraphInlineMark["type"][] = [
    "bold",
    "italic",
    "code",
    "link",
  ];
  for (let i = 0; i < n; i += 1) {
    const a = Math.floor(rng() * textLength);
    const b = Math.floor(rng() * textLength);
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    if (start === end) continue;
    const type = types[Math.floor(rng() * types.length)];
    if (type === "link") {
      marks.push({ start, end, type, url: "https://example.test/" + i });
    } else {
      marks.push({ start, end, type });
    }
  }
  return dedupeMarks(marks);
}

function dedupeMarks(marks: ParagraphInlineMark[]): ParagraphInlineMark[] {
  const seen = new Set<string>();
  const out: ParagraphInlineMark[] = [];
  for (const m of marks) {
    const key = `${m.start}-${m.end}-${m.type}-${m.url ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}
