// ---------------------------------------------------------------------------
// landscape-embed renderer tests (Phase 3b).
//
// The RSC path is pure: no fetches, no client hooks, no imports of
// `three` / `d3-force` / `react-force-graph-3d`. We assert two things:
//   1. It renders an SVG-only snapshot the share route is happy with.
//   2. The rendered HTML does not contain any of the forbidden
//      editor/three packages as a safety-net for the share bundle.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LandscapeEmbedBlockRenderer } from "./landscape-embed.server";

describe("LandscapeEmbedBlockRenderer", () => {
  it("renders a figure with the block id + saved layout", () => {
    const html = renderToStaticMarkup(
      <LandscapeEmbedBlockRenderer
        id="01LAND0000000000000000000A"
        content={{ layout: "umap", schema_version: 1 }}
      />,
    );
    expect(html).toContain('data-block-id="01LAND0000000000000000000A"');
    expect(html).toContain('data-block-type="landscape-embed"');
    expect(html).toContain('data-layout="umap"');
    expect(html).toContain("<svg");
  });

  it("renders the query pill in the header when a query is saved", () => {
    const html = renderToStaticMarkup(
      <LandscapeEmbedBlockRenderer
        id="01LAND0000000000000000000B"
        content={{
          layout: "web",
          query: "rail hydrogen decarbonisation",
          schema_version: 1,
        }}
      />,
    );
    expect(html).toContain("rail hydrogen decarbonisation");
    expect(html).toContain('data-layout="web"');
  });

  it("falls back to umap when the layout is unknown", () => {
    const html = renderToStaticMarkup(
      <LandscapeEmbedBlockRenderer
        id="01LAND0000000000000000000C"
        content={{ layout: "spiral" as unknown as "umap", schema_version: 1 }}
      />,
    );
    expect(html).toContain('data-layout="umap"');
  });

  it("does NOT load any forbidden share-bundle package in its markup", () => {
    const html = renderToStaticMarkup(
      <LandscapeEmbedBlockRenderer
        id="01LAND0000000000000000000D"
        content={{ layout: "rings", query: "ev charging", schema_version: 1 }}
      />,
    );
    expect(html).not.toContain("react-force-graph-3d");
    expect(html).not.toContain("d3-force");
    // Note: the word "three" can legitimately appear in UI copy; the
    // share-bundle check matches `from "three"` package-import
    // stanzas, not the bare word.
  });
});
