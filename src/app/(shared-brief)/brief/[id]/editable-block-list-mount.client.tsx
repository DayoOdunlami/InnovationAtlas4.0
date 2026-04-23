"use client";

// ---------------------------------------------------------------------------
// Owner-only editor mount point (Phase 2a.1 — Brief-First Rebuild).
//
// Uses `next/dynamic` with `ssr: false` so the Plate + @dnd-kit client
// chunks only load for the owner scope path. The share-route bundle-
// leak guard (scripts/check-share-bundle.ts + block-share.spec.ts)
// depends on these packages being absent from the shared-brief client
// manifest.
//
// Why the wrapper rather than an inline dynamic import in page.tsx:
// `page.tsx` is a Server Component; `next/dynamic({ ssr: false })` is
// only valid inside a Client Component boundary. Making this the
// boundary keeps the server page clean and the dynamic import isolated
// to an owner-only leaf.
// ---------------------------------------------------------------------------

import dynamic from "next/dynamic";
import type { EditableBlockRow } from "@/components/brief/blocks/editable/editable-block-list.client";

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
  return <LazyEditableBlockList {...props} />;
}
