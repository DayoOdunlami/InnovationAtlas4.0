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
