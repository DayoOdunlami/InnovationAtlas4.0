// ---------------------------------------------------------------------------
// Phase 3d — landscape focus-card RSC renderer tests.
//
// `focus-card` render must be:
//   * RSC-safe (no `three`, no `react-force-graph-3d`, no `d3-force`)
//   * tolerant of missing node ids ("Node no longer in landscape")
//   * readable across dark/light/print themes
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LANDSCAPE_SNAPSHOT } from "@/lib/landscape/snapshot";
import { LandscapeFocusCardRenderer } from "./landscape-focus-card.server";

const firstProject = LANDSCAPE_SNAPSHOT.nodes.find(
  (n) => n.type === "project",
)!;

describe("LandscapeFocusCardRenderer", () => {
  it("renders a rich semantic card for an existing project id", () => {
    const html = renderToStaticMarkup(
      <LandscapeFocusCardRenderer
        id="01FOCUS00000000000000000000"
        content={{
          schema_version: 2,
          mode: "gravity",
          zAxis: "score",
          display: "focus-card",
          cameraPreset: "topdown",
          theme: "light",
          queryA: "rail hydrogen",
          focusedNodeId: firstProject.id,
          caption: "Focus card caption",
        }}
      />,
    );
    expect(html).toContain('data-block-type="landscape-embed"');
    expect(html).toContain('data-display="focus-card"');
    expect(html).toContain(firstProject.title.slice(0, 10));
    // freshness line
    expect(html).toMatch(/Landscape as of \d{4}-\d{2}-\d{2}/);
  });

  it("gracefully renders 'Node no longer in landscape' for missing ids", () => {
    const html = renderToStaticMarkup(
      <LandscapeFocusCardRenderer
        id="01FOCUS00000000000000000001"
        content={{
          schema_version: 2,
          mode: "gravity",
          zAxis: "score",
          display: "focus-card",
          cameraPreset: "topdown",
          theme: "print",
          focusedNodeId: "does-not-exist",
        }}
      />,
    );
    expect(html).toContain("Node no longer in landscape");
  });

  it("does NOT leak any forbidden client-only bundle name into markup", () => {
    const html = renderToStaticMarkup(
      <LandscapeFocusCardRenderer
        id="01FOCUS00000000000000000002"
        content={{
          schema_version: 2,
          mode: "gravity",
          zAxis: "score",
          display: "focus-card",
          cameraPreset: "topdown",
          theme: "dark",
          focusedNodeId: firstProject.id,
        }}
      />,
    );
    expect(html).not.toContain("react-force-graph-3d");
    expect(html).not.toContain("d3-force");
    expect(html).not.toContain('from "three"');
  });
});
