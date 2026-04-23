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
// place to extend when 2b / 3a add more renderers.
//
// Phase 3a: `live-passport-view` blocks are dispatched to
// `LivePassportViewBlockRenderer`. The `isOwner` flag controls whether
// the owner Realtime island is mounted (owner) or a static snapshot is
// shown (share scope).
// ---------------------------------------------------------------------------

import type { BlockRow } from "./types";
import { BulletsBlockRenderer } from "./renderers/bullets.server";
import { HeadingBlockRenderer } from "./renderers/heading.server";
import { ParagraphBlockRenderer } from "./renderers/paragraph.server";
import { PlaceholderBlockRenderer } from "./renderers/placeholder.server";
import { LivePassportViewBlockRenderer } from "./renderers/live-passport-view.server";

async function dispatch(
  block: BlockRow,
  isOwner: boolean,
): Promise<React.ReactNode> {
  // NOTE: Phase 2a.1 renders heading + paragraph + bullets. Phase 3a
  // adds live-passport-view. All other v1 block types still render a
  // silent, aria-hidden placeholder so share recipients see
  // production-shaped empty space rather than "coming soon" chrome.
  if (block.type === "heading") {
    return <HeadingBlockRenderer id={block.id} content={block.contentJson} />;
  }
  if (block.type === "paragraph") {
    return <ParagraphBlockRenderer id={block.id} content={block.contentJson} />;
  }
  if (block.type === "bullets") {
    return <BulletsBlockRenderer id={block.id} content={block.contentJson} />;
  }
  if (block.type === "live-passport-view") {
    return (
      <LivePassportViewBlockRenderer
        id={block.id}
        content={block.contentJson}
        isOwner={isOwner}
      />
    );
  }
  return <PlaceholderBlockRenderer id={block.id} type={block.type} />;
}

export async function BlockList({
  blocks,
  isOwner = false,
}: {
  blocks: BlockRow[];
  isOwner?: boolean;
}) {
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
  const rendered = await Promise.all(
    blocks.map((block) => dispatch(block, isOwner)),
  );
  return (
    <div data-testid="brief-blocks" className="flex flex-col gap-4">
      {rendered.map((node, i) => (
        <div key={blocks[i].id}>{node}</div>
      ))}
    </div>
  );
}
