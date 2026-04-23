"use client";

// ---------------------------------------------------------------------------
// Owner-only editor mount point (Phase 2a.1, extended in Phase 3b).
//
// Uses `next/dynamic` with `ssr: false` so the Plate + @dnd-kit client
// chunks only load for the owner scope path. The share-route bundle-
// leak guard (scripts/check-share-bundle.ts + block-share.spec.ts)
// depends on these packages being absent from the shared-brief client
// manifest.
//
// Phase 3b addition: landscape-embed blocks are NOT text — they can't
// live inside the Plate editor's single-document tree. Instead, the
// text editor handles heading / paragraph / bullets rows only; any
// landscape-embed rows render alongside the editor as interactive
// `<LandscapeEmbedMount/>` islands that dynamically import the full
// force-graph lens. Row order is preserved visually because landscape-
// embed rows are interleaved based on their `position` key.
// ---------------------------------------------------------------------------

import dynamic from "next/dynamic";
import type { EditableBlockRow } from "@/components/brief/blocks/editable/editable-block-list.client";
import type { LandscapeEmbedContent } from "@/components/brief/blocks/types";
import { LandscapeEmbedMount } from "@/components/brief/blocks/editable/landscape-embed-mount.client";

const LazyEditableBlockList = dynamic(
  () =>
    import(
      "@/components/brief/blocks/editable/editable-block-list.client"
    ).then((m) => ({ default: m.EditableBlockList })),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="brief-blocks-editable-loading"
        className="text-sm text-muted-foreground"
      >
        Loading editor…
      </div>
    ),
  },
);

export function EditableBlockListMount(props: {
  briefId: string;
  initialBlocks: EditableBlockRow[];
}) {
  const textBlocks = props.initialBlocks.filter(
    (b) =>
      b.type === "heading" || b.type === "paragraph" || b.type === "bullets",
  );
  const landscapeBlocks = props.initialBlocks.filter(
    (b) => b.type === "landscape-embed",
  );

  return (
    <div className="flex flex-col gap-6" data-testid="brief-owner-surface">
      <LazyEditableBlockList
        briefId={props.briefId}
        initialBlocks={textBlocks}
      />
      {landscapeBlocks.length > 0 && (
        <section
          aria-label="Landscape embeds"
          className="flex flex-col gap-4"
          data-testid="brief-landscape-embeds"
        >
          {landscapeBlocks.map((b) => (
            <LandscapeEmbedMount
              key={b.id}
              blockId={b.id}
              content={
                (b.contentJson ?? {
                  layout: "umap",
                  schema_version: 1,
                }) as LandscapeEmbedContent
              }
            />
          ))}
        </section>
      )}
    </div>
  );
}
