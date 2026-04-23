"use client";

// ---------------------------------------------------------------------------
// Owner-scope editable mount for `landscape-embed` blocks (Phase 3b).
//
// This is the "use client" mount referenced in the Phase 3b execution
// prompt line 41: "New 'use client' editable mount for owner scope
// that renders the full interactive lens."
//
// It dynamically imports the `ForceGraphLens` only on the owner path.
// Share-scope pages never reach this component — they hit the server
// `LandscapeEmbedBlockRenderer` instead. The share-route bundle check
// adds `three`, `react-force-graph-3d`, and `d3-force` to the
// forbidden list so any accidental static import gets caught.
// ---------------------------------------------------------------------------

import dynamic from "next/dynamic";
import type { LandscapeEmbedContent } from "../types";

const LazyForceGraphLens = dynamic(
  () =>
    import("@/components/landscape/force-graph-lens").then((m) => ({
      default: m.ForceGraphLens,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-[16/9] w-full items-center justify-center border border-border bg-[#0a0e13] text-xs text-muted-foreground">
        Loading landscape lens…
      </div>
    ),
  },
);

export function LandscapeEmbedMount({
  blockId,
  content,
}: {
  blockId: string;
  content: LandscapeEmbedContent;
}) {
  const layout =
    content.layout === "web" || content.layout === "rings"
      ? content.layout
      : "umap";

  return (
    <div
      data-block-id={blockId}
      data-block-type="landscape-embed"
      className="overflow-hidden rounded-md border border-border"
    >
      <div className="aspect-[16/9] w-full">
        <LazyForceGraphLens
          variant="canvas"
          initialLayout={layout}
          initialQuery={content.query ?? null}
          compact
          disableUrlState
        />
      </div>
    </div>
  );
}
