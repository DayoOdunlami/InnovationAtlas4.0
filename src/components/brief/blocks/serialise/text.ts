// ---------------------------------------------------------------------------
// Plate ↔ stored-projection serialiser (Phase 2a.1 — Block Types Spec
// §3.1 / §3.2 / §3.3).
//
// The Plate editor owns three text block types in 2a.1: heading,
// paragraph, bullets. Internally Plate stores each as a `Value` node
// with `children: Text[]`, where each Text carries mark booleans
// (`bold`, `italic`, `code`) or a link wrapper. Atlas stores the
// block's `content_json` projection defined in the Block Types Spec.
// This module is the pure bidirectional bridge between the two.
//
// Invariant: for every valid projection `p`,
//   deserialise(serialise(fromProjection(p))) ≡ p   (up to normalisation)
// and for every Plate node produced by the editor,
//   fromProjection(serialise(node)) yields an equivalent node.
//
// The round-trip test (text.test.ts) fuzzes this with 1000 random
// paragraph mark configurations.
// ---------------------------------------------------------------------------

import type {
  BulletsContent,
  HeadingContent,
  ParagraphContent,
  ParagraphInlineMark,
} from "../types";

// ---------------------------------------------------------------------------
// Plate node shapes used in 2a.1. Kept narrow: we only serialise the
// three text types, and we only honour the marks defined in the spec.
// ---------------------------------------------------------------------------

export type PlateText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type PlateLink = {
  type: "a";
  url: string;
  children: PlateText[];
};

export type PlateInline = PlateText | PlateLink;

export type PlateHeading = {
  type: "h1" | "h2" | "h3";
  children: PlateText[];
};

export type PlateParagraph = {
  type: "p";
  children: PlateInline[];
};

export type PlateListItem = {
  type: "li";
  indent?: number;
  children: PlateText[];
};

export type PlateBulletsList = {
  type: "ul" | "ol";
  children: PlateListItem[];
};

export type PlateBlockNode = PlateHeading | PlateParagraph | PlateBulletsList;

// ---------------------------------------------------------------------------
// Heading
// ---------------------------------------------------------------------------

export function headingToPlate(content: HeadingContent): PlateHeading {
  const level = content.level === 2 ? 2 : content.level === 3 ? 3 : 1;
  const text = typeof content.text === "string" ? content.text : "";
  return {
    type: `h${level}` as "h1" | "h2" | "h3",
    children: [{ text: text.slice(0, 200) }],
  };
}

export function plateToHeading(node: PlateHeading): HeadingContent {
  const level: 1 | 2 | 3 = node.type === "h2" ? 2 : node.type === "h3" ? 3 : 1;
  const text = (node.children ?? [])
    .map((c) => c.text ?? "")
    .join("")
    .slice(0, 200);
  return { level, text };
}

// ---------------------------------------------------------------------------
// Paragraph — the complex one. Plate uses flat mark booleans on Text
// nodes; atlas stores disjoint marks with explicit (start,end,type,url?).
// ---------------------------------------------------------------------------

export function paragraphToPlate(content: ParagraphContent): PlateParagraph {
  const text = typeof content.text === "string" ? content.text : "";
  const marks = Array.isArray(content.inline_formatting)
    ? content.inline_formatting.filter((m) => m && typeof m === "object")
    : [];

  // Build a sorted boundary list from mark start/end positions.
  const boundaries = new Set<number>([0, text.length]);
  for (const m of marks) {
    if (
      typeof m.start === "number" &&
      typeof m.end === "number" &&
      m.start >= 0 &&
      m.end <= text.length &&
      m.start < m.end
    ) {
      boundaries.add(m.start);
      boundaries.add(m.end);
    }
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const children: PlateInline[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (s === e) continue;
    const slice = text.slice(s, e);
    const active = marks.filter((m) => m.start <= s && m.end >= e);
    const link = active.find(
      (m) => m.type === "link" && typeof m.url === "string",
    );
    const textNode: PlateText = { text: slice };
    if (active.some((m) => m.type === "bold")) textNode.bold = true;
    if (active.some((m) => m.type === "italic")) textNode.italic = true;
    if (active.some((m) => m.type === "code")) textNode.code = true;
    if (link) {
      children.push({
        type: "a",
        url: (link.url as string) ?? "",
        children: [textNode],
      });
    } else {
      children.push(textNode);
    }
  }
  // Plate rejects an empty `children` array; always include at least a
  // single empty text node.
  if (children.length === 0) {
    children.push({ text: "" });
  }
  return { type: "p", children };
}

export function plateToParagraph(node: PlateParagraph): ParagraphContent {
  let text = "";
  const marks: ParagraphInlineMark[] = [];

  for (const child of node.children ?? []) {
    if ("type" in child && child.type === "a") {
      const start = text.length;
      let inner = "";
      for (const t of child.children ?? []) {
        inner += t.text ?? "";
      }
      text += inner;
      if (inner.length > 0 && typeof child.url === "string") {
        marks.push({
          start,
          end: text.length,
          type: "link",
          url: child.url,
        });
      }
      // Emit any overlapping character marks too.
      for (const t of child.children ?? []) {
        emitTextMarks(t, text.length - inner.length, marks, t.text ?? "");
      }
    } else {
      const t = child as PlateText;
      const start = text.length;
      text += t.text ?? "";
      emitTextMarks(t, start, marks, t.text ?? "");
    }
  }

  const merged = mergeAdjacentMarks(marks);
  return merged.length > 0 ? { text, inline_formatting: merged } : { text };
}

function emitTextMarks(
  t: PlateText,
  start: number,
  out: ParagraphInlineMark[],
  slice: string,
) {
  if (slice.length === 0) return;
  const end = start + slice.length;
  if (t.bold) out.push({ start, end, type: "bold" });
  if (t.italic) out.push({ start, end, type: "italic" });
  if (t.code) out.push({ start, end, type: "code" });
}

function mergeAdjacentMarks(
  marks: ParagraphInlineMark[],
): ParagraphInlineMark[] {
  const byType: Record<string, ParagraphInlineMark[]> = {};
  for (const m of marks) {
    const key = m.type === "link" ? `link:${m.url ?? ""}` : m.type;
    (byType[key] ??= []).push(m);
  }
  const out: ParagraphInlineMark[] = [];
  for (const key of Object.keys(byType)) {
    const arr = byType[key].sort((a, b) => a.start - b.start);
    let cur: ParagraphInlineMark | null = null;
    for (const m of arr) {
      if (cur && m.start <= cur.end) {
        cur.end = Math.max(cur.end, m.end);
      } else {
        if (cur) out.push(cur);
        cur = { ...m };
      }
    }
    if (cur) out.push(cur);
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}

// ---------------------------------------------------------------------------
// Bullets — mapped to a single Plate list node (`ul` / `ol`) whose
// children are `li` with an `indent` attribute (0..2). The editor Tab /
// Shift+Tab handlers mutate `indent` rather than re-nesting the DOM, so
// the flat shape on both sides is symmetric.
// ---------------------------------------------------------------------------

export function bulletsToPlate(content: BulletsContent): PlateBulletsList {
  const style = content.style === "numbered" ? "numbered" : "bullet";
  const items = Array.isArray(content.items) ? content.items : [];
  const indent = Array.isArray(content.indent) ? content.indent : [];
  const listType = style === "numbered" ? "ol" : "ul";
  const children: PlateListItem[] = items.map((raw, i) => ({
    type: "li",
    indent: clampIndent(indent[i] ?? 0),
    children: [{ text: typeof raw === "string" ? raw : "" }],
  }));
  if (children.length === 0) {
    children.push({ type: "li", indent: 0, children: [{ text: "" }] });
  }
  return { type: listType, children };
}

export function plateToBullets(node: PlateBulletsList): BulletsContent {
  const style = node.type === "ol" ? "numbered" : "bullet";
  const items: string[] = [];
  const indent: number[] = [];
  for (const li of node.children ?? []) {
    const text = (li.children ?? []).map((c) => c.text ?? "").join("");
    items.push(text);
    indent.push(clampIndent(li.indent ?? 0));
  }
  // Drop trailing empty rows so that exiting a list doesn't persist an
  // accidental blank item — commit semantics per Block Types Spec §3.3.
  while (items.length > 0 && items[items.length - 1] === "") {
    items.pop();
    indent.pop();
  }
  return { style, items, indent };
}

function clampIndent(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 2) return 2;
  return Math.floor(n);
}
