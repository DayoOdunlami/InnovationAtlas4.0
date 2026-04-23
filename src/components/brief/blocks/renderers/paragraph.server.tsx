// ---------------------------------------------------------------------------
// Read-only paragraph renderer (Phase 2a.0 — Block Types Spec §3.2).
//
// Renders `<p>` with inline_formatting applied. Phase 2a.0 is read-only
// — no editing affordances. Inline marks overlap at most two ways
// (bold+italic), with `code` and `link` treated as atomic ranges that
// must not overlap (spec). To tolerate malformed agent output we
// simply render overlapping marks as nested spans in mark order.
//
// Algorithm
// ---------
// Walk the mark boundaries: break the text into minimal segments where
// the active set of marks is constant. Emit each segment wrapped in
// the appropriate tags (outermost → innermost = link > code > bold >
// italic). This is O(n·marks) which is fine for the ≤10,000 char
// budget.
// ---------------------------------------------------------------------------

import type { ParagraphContent, ParagraphInlineMark } from "../types";

const MARK_RANK: Record<ParagraphInlineMark["type"], number> = {
  link: 0,
  code: 1,
  bold: 2,
  italic: 3,
};

function sanitiseMarks(
  raw: unknown,
  textLength: number,
): ParagraphInlineMark[] {
  if (!Array.isArray(raw)) return [];
  const out: ParagraphInlineMark[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const mark = m as Partial<ParagraphInlineMark>;
    const start = Number(mark.start);
    const end = Number(mark.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0 || end > textLength || start >= end) continue;
    if (
      mark.type !== "bold" &&
      mark.type !== "italic" &&
      mark.type !== "code" &&
      mark.type !== "link"
    ) {
      continue;
    }
    if (mark.type === "link" && typeof mark.url !== "string") continue;
    out.push({
      start,
      end,
      type: mark.type,
      ...(mark.type === "link" ? { url: mark.url } : {}),
    });
  }
  return out;
}

type Segment = {
  text: string;
  marks: ParagraphInlineMark[];
};

function buildSegments(text: string, marks: ParagraphInlineMark[]): Segment[] {
  if (marks.length === 0) return [{ text, marks: [] }];
  const boundaries = new Set<number>([0, text.length]);
  for (const m of marks) {
    boundaries.add(m.start);
    boundaries.add(m.end);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (s === e) continue;
    const slice = text.slice(s, e);
    const activeMarks = marks.filter((m) => m.start <= s && m.end >= e);
    activeMarks.sort((a, b) => MARK_RANK[a.type] - MARK_RANK[b.type]);
    segments.push({ text: slice, marks: activeMarks });
  }
  return segments;
}

function renderSegment(segment: Segment, key: number): React.ReactNode {
  let node: React.ReactNode = segment.text;
  // Apply marks innermost → outermost. Sorted array is outer → inner,
  // so iterate in reverse.
  for (let i = segment.marks.length - 1; i >= 0; i -= 1) {
    const mark = segment.marks[i];
    if (mark.type === "italic") {
      node = <em>{node}</em>;
    } else if (mark.type === "bold") {
      node = <strong>{node}</strong>;
    } else if (mark.type === "code") {
      node = (
        <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {node}
        </code>
      );
    } else if (mark.type === "link" && mark.url) {
      node = (
        <a
          href={mark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-primary"
        >
          {node}
        </a>
      );
    }
  }
  return <span key={key}>{node}</span>;
}

export function ParagraphBlockRenderer({
  id,
  content,
}: {
  id: string;
  content: unknown;
}) {
  const c = (content ?? {}) as Partial<ParagraphContent>;
  const raw = typeof c.text === "string" ? c.text : "";
  // Paragraph content is capped at 10,000 chars per spec; truncate
  // defensively to avoid a runaway DOM if an agent exceeds the limit.
  const text = raw.length > 10_000 ? raw.slice(0, 10_000) : raw;
  const marks = sanitiseMarks(c.inline_formatting, text.length);
  const segments = buildSegments(text, marks);
  return (
    <p
      data-block-id={id}
      data-block-type="paragraph"
      className="leading-relaxed text-foreground"
    >
      {segments.map((s, i) => renderSegment(s, i))}
    </p>
  );
}
