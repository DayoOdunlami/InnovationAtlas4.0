// ---------------------------------------------------------------------------
// Block list (Phase 2a.0 — Brief-First Rebuild).
//
// Pure Server Component — used by both the owner (`/brief/[id]`) and
// share-scope (`/brief/[id]?share=<token>`) routes. Does NOT import
// Plate or any client-only editor chunks; 2a.1 adds the client island
// adjacent to this module (`block-editor.client.tsx`) so the share
// route never pulls the editor bundle.
//
// Per spec §4.1, only `heading` and `paragraph` render a visible
// component in 2a.0. Every other v1 type emits a silent placeholder
// via PlaceholderBlockRenderer. The visible-type dispatch is the only
// place to extend when 2b / 3a land more renderers.
// ---------------------------------------------------------------------------

import type { BlockRow } from "./types";
import { BulletsBlockRenderer } from "./renderers/bullets.server";
import { HeadingBlockRenderer } from "./renderers/heading.server";
import { ParagraphBlockRenderer } from "./renderers/paragraph.server";
import { PlaceholderBlockRenderer } from "./renderers/placeholder.server";

function dispatch(block: BlockRow): React.ReactNode {
  // NOTE: Phase 2a.1 renders heading + paragraph + bullets. All other
  // v1 block types still render a silent, aria-hidden placeholder so
  // share recipients see production-shaped empty space rather than
  // "coming soon" chrome. 2b / 3a add the rest.
  if (block.type === "heading") {
    return <HeadingBlockRenderer id={block.id} content={block.contentJson} />;
  }
  if (block.type === "paragraph") {
    return <ParagraphBlockRenderer id={block.id} content={block.contentJson} />;
  }
  if (block.type === "bullets") {
    return <BulletsBlockRenderer id={block.id} content={block.contentJson} />;
  }
  return <PlaceholderBlockRenderer id={block.id} type={block.type} />;
}

export function BlockList({ blocks }: { blocks: BlockRow[] }) {
  if (blocks.length === 0) {
    return (
      <div
        data-testid="brief-blocks-empty"
        className="text-sm text-muted-foreground"
      >
        No blocks yet.
      </div>
    );
  }
  return (
    <div data-testid="brief-blocks" className="flex flex-col gap-4">
      {blocks.map((block) => (
        <div key={block.id}>{dispatch(block)}</div>
      ))}
    </div>
  );
}
