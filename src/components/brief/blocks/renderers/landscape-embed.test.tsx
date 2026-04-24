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
import { LANDSCAPE_SNAPSHOT } from "@/lib/landscape/snapshot";
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

  // Phase 3d additions ------------------------------------------------
  it("renders a v2 gravity block with queryA + caption", () => {
    const html = renderToStaticMarkup(
      <LandscapeEmbedBlockRenderer
        id="01LAND0000000000000000000E"
        content={{
          schema_version: 2,
          queryA: "hydrogen fuel cell rail",
          mode: "gravity",
          zAxis: "score",
          display: "graph",
          cameraPreset: "topdown",
          theme: "light",
          caption: "A gravity view anchored on hydrogen rail.",
        }}
      />,
    );
    expect(html).toContain("hydrogen fuel cell rail");
    expect(html).toContain("A gravity view anchored on hydrogen rail.");
    expect(html).toContain('data-mode="gravity"');
    expect(html).toContain('data-theme="light"');
    expect(html).toMatch(/Landscape as of \d{4}-\d{2}-\d{2}/);
  });

  it("renders a v2 graph-with-focus block using the valid focusedNodeId", () => {
    // Pull a real node id from the snapshot so the focus card renders
    // with a known title.
    const target = LANDSCAPE_SNAPSHOT.nodes.find((n) => n.type === "project")!;
    const html = renderToStaticMarkup(
      <LandscapeEmbedBlockRenderer
        id="01LAND0000000000000000000F"
        content={{
          schema_version: 2,
          queryA: "rail",
          mode: "gravity",
          zAxis: "score",
          display: "graph-with-focus",
          cameraPreset: "topdown",
          theme: "light",
          focusedNodeId: target.id,
        }}
      />,
    );
    expect(html).toContain('data-display="graph-with-focus"');
    // Focus card is embedded in the output.
    expect(html).toContain("1-hop neighbours");
  });

  it("still renders v1 blocks via the v2 normalisation path", () => {
    // Regression — existing briefs saved with schema_version: 1 must
    // keep rendering.
    const html = renderToStaticMarkup(
      <LandscapeEmbedBlockRenderer
        id="01LAND0000000000000000000V1"
        content={{
          layout: "web",
          query: "autonomous shipping",
          schema_version: 1,
        }}
      />,
    );
    expect(html).toContain("autonomous shipping");
    expect(html).toContain('data-layout="web"');
    expect(html).toContain('data-mode="gravity"');
  });
});
