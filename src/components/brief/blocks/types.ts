// ---------------------------------------------------------------------------
// Shared block-render types (Phase 2a.0, Brief-First Rebuild — Block
// Types Spec §3). Kept intentionally small: just the two shapes we
// render in this phase plus the block row shape the server fetches.
//
// The full `AtlasBlockEntity` type from `@/lib/db/pg/schema.pg` carries
// additional DB-only columns (reserved fields, timestamps). Renderers
// only need id/type/contentJson — this narrow `BlockRow` contract keeps
// the component layer decoupled from schema changes.
// ---------------------------------------------------------------------------

export type BlockRow = {
  id: string;
  type: string;
  contentJson: unknown;
};

export type HeadingContent = {
  level: 1 | 2 | 3;
  text: string;
};

export type ParagraphInlineMark = {
  start: number;
  end: number;
  type: "bold" | "italic" | "code" | "link";
  url?: string;
};

export type ParagraphContent = {
  text: string;
  inline_formatting?: ParagraphInlineMark[];
};

// Phase 2a.1 — Block Types Spec §3.3. `items` length bounded to 50,
// `indent[i]` ∈ {0,1,2}; missing `indent[i]` treated as 0.
export type BulletsStyle = "bullet" | "numbered";

export type BulletsContent = {
  style: BulletsStyle;
  items: string[];
  indent?: number[];
};
