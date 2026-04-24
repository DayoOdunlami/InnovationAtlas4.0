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

// Phase 3b/3d — landscape-embed block.
//
// v1 (Phase 3b): `{ query?, layout: 'web'|'umap'|'rings', lens?,
// schema_version: 1 }`. Still accepted on read for backward
// compatibility with existing briefs.
//
// v2 (Phase 3d): JSON-only extension (no DB migration) that adds
// narrative-driven fields: `queryA`/`queryB` for gravity + compare,
// `display` (graph | focus-card | graph-with-focus), `focusedNodeId`,
// `cameraPreset` (topdown default), `theme` (dark | light | print),
// `caption`, and optional `flythrough` descriptor for AI-authored
// guided tours. New writes via `AppendLandscapeEmbed` emit v2; v1
// rows are migrated server-side on write and client-side on render.
export type LandscapeEmbedLayout = "web" | "umap" | "rings";

export type LandscapeEmbedContentV1 = {
  query?: string;
  layout: LandscapeEmbedLayout;
  lens?: string;
  schema_version: 1;
};

export type FlythroughStopV2 = {
  kind: "node" | "cluster" | "compare" | "camera";
  nodeId?: string;
  clusterId?: number;
  query?: string;
  queryB?: string;
  caption: string;
  narration?: string;
  duration: number;
  transition: number;
  cameraTarget?: { x: number; y: number; z: number };
  cameraTheta?: number;
  cameraPhi?: number;
  cameraDistance?: number;
};

export type LandscapeEmbedContentV2 = {
  schema_version: 2;
  queryA?: string;
  queryB?: string;
  mode: "gravity" | "compare" | "explore";
  zAxis: "score" | "time" | "funding" | "flat";
  display: "graph" | "focus-card" | "graph-with-focus";
  focusedNodeId?: string;
  cameraPreset: "topdown" | "fit" | "explore";
  theme: "dark" | "light" | "print";
  caption?: string;
  flythrough?: {
    autoplay: boolean;
    loop: boolean;
    stops: FlythroughStopV2[];
  };
};

export type LandscapeEmbedContent =
  | LandscapeEmbedContentV1
  | LandscapeEmbedContentV2;

// Render-time view: both v1 and v2 normalised to v2-shaped fields so
// renderers only code against one shape.
export type LandscapeEmbedViewModel = LandscapeEmbedContentV2;

export function normaliseLandscapeEmbedContent(
  content: unknown,
): LandscapeEmbedViewModel {
  const c = (content ?? {}) as Partial<LandscapeEmbedContentV1> &
    Partial<LandscapeEmbedContentV2>;
  if (c.schema_version === 2) {
    return {
      schema_version: 2,
      queryA: c.queryA,
      queryB: c.queryB,
      mode: c.mode ?? "gravity",
      zAxis: c.zAxis ?? "score",
      display: c.display ?? "graph",
      focusedNodeId: c.focusedNodeId,
      cameraPreset: c.cameraPreset ?? "topdown",
      theme: c.theme ?? "light",
      caption: c.caption,
      flythrough: c.flythrough,
    };
  }
  const layout = c.layout === "web" || c.layout === "rings" ? c.layout : "umap";
  return {
    schema_version: 2,
    queryA: c.query,
    mode: layout === "umap" ? "explore" : "gravity",
    zAxis: "score",
    display: "graph",
    cameraPreset: layout === "rings" ? "fit" : "topdown",
    theme: "light",
  };
}
