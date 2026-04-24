"use client";

// ---------------------------------------------------------------------------
// Owner-scope editable mount for `landscape-embed` blocks.
//
// Phase 3b: dynamic import of the interactive lens behind `next/dynamic`
// so `three` / `d3-force` never enter the share-scope bundle.
//
// Phase 3d: pass through the v2 fields — `queryA`, `queryB`, `mode`,
// `zAxis`, `display`, `focusedNodeId`, `cameraPreset`, `theme`,
// `caption`, and `flythrough`. `display: "focus-card"` renders the
// server-side card instead of the live lens (still wrapped in a
// client island so editing still works). `graph-with-focus` stacks
// both.
// ---------------------------------------------------------------------------

import dynamic from "next/dynamic";
import type { LandscapeEmbedContent } from "../types";
import { normaliseLandscapeEmbedContent } from "../types";
import { LandscapeFocusCardRenderer } from "../renderers/landscape-focus-card.server";

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
  const vm = normaliseLandscapeEmbedContent(content);

  if (vm.display === "focus-card") {
    return (
      <div
        data-block-id={blockId}
        data-block-type="landscape-embed"
        className="overflow-hidden rounded-md border border-border"
      >
        <LandscapeFocusCardRenderer id={blockId} content={content} embedded />
      </div>
    );
  }

  const lens = (
    <div className="aspect-[16/9] w-full">
      <LazyForceGraphLens
        variant="canvas"
        initialQuery={vm.queryA ?? null}
        initialQueryB={vm.queryB ?? null}
        initialMode={vm.mode}
        initialZAxis={vm.zAxis}
        initialFocusedId={vm.focusedNodeId ?? null}
        initialCameraPreset={vm.cameraPreset}
        theme={vm.theme}
        compact
        disableUrlState
        hideChrome
        caption={vm.caption ?? null}
        flythrough={vm.flythrough ?? null}
      />
    </div>
  );

  if (vm.display === "graph-with-focus") {
    return (
      <div
        data-block-id={blockId}
        data-block-type="landscape-embed"
        className="flex flex-col gap-3 md:flex-row"
      >
        <div className="overflow-hidden rounded-md border border-border md:flex-1">
          {lens}
        </div>
        <div className="md:w-[340px]">
          <LandscapeFocusCardRenderer id={blockId} content={content} embedded />
        </div>
      </div>
    );
  }

  return (
    <div
      data-block-id={blockId}
      data-block-type="landscape-embed"
      className="overflow-hidden rounded-md border border-border"
    >
      {lens}
    </div>
  );
}
