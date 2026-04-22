// ---------------------------------------------------------------------------
// Read-only heading renderer (Phase 2a.0 — Block Types Spec §3.1).
//
// Renders `<h1>` / `<h2>` / `<h3>` by `level`. Text is plain — no
// inline formatting on headings in v1. Inline editing and the
// authoring affordance ship in 2a.1.
// ---------------------------------------------------------------------------

import type { HeadingContent } from "../types";

function normaliseLevel(level: unknown): 1 | 2 | 3 {
  return level === 2 ? 2 : level === 3 ? 3 : 1;
}

function clampText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.slice(0, 200);
}

export function HeadingBlockRenderer({
  id,
  content,
}: {
  id: string;
  content: unknown;
}) {
  const c = (content ?? {}) as Partial<HeadingContent>;
  const level = normaliseLevel(c.level);
  const text = clampText(c.text);
  const common = {
    "data-block-id": id,
    "data-block-type": "heading",
  } as const;
  if (level === 1) {
    return (
      <h1 {...common} className="text-2xl font-semibold text-foreground">
        {text}
      </h1>
    );
  }
  if (level === 2) {
    return (
      <h2 {...common} className="text-xl font-semibold text-foreground">
        {text}
      </h2>
    );
  }
  return (
    <h3 {...common} className="text-lg font-semibold text-foreground">
      {text}
    </h3>
  );
}
