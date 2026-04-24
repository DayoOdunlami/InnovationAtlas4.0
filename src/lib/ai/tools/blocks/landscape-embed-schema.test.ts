// ---------------------------------------------------------------------------
// Phase 3d — `LandscapeEmbedContent` v1/v2 parsing + legacy-to-v2
// mapping + refinement error coverage.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  LandscapeEmbedContent,
  LandscapeEmbedContentV1,
  LandscapeEmbedContentV2,
  migrateLandscapeEmbedV1ToV2,
} from "./index";

describe("LandscapeEmbedContent v1/v2 union", () => {
  it("parses v1 umap with no query", () => {
    const res = LandscapeEmbedContent.safeParse({
      layout: "umap",
      schema_version: 1,
    });
    expect(res.success).toBe(true);
  });

  it("rejects v1 web without a query", () => {
    const res = LandscapeEmbedContent.safeParse({
      layout: "web",
      schema_version: 1,
    });
    expect(res.success).toBe(false);
  });

  it("parses v2 gravity with queryA + caption + theme", () => {
    const res = LandscapeEmbedContent.safeParse({
      schema_version: 2,
      queryA: "rail hydrogen decarbonisation",
      mode: "gravity",
      display: "graph",
      theme: "light",
      caption: "Where hydrogen rail fits inside the wider decarbonisation map.",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      // v2 refinements populate defaults.
      const v = res.data as {
        schema_version: 2;
        zAxis: string;
        cameraPreset: string;
      };
      expect(v.schema_version).toBe(2);
      expect(v.zAxis).toBe("score");
      expect(v.cameraPreset).toBe("topdown");
    }
  });

  it("v2 compare without queryB fails the refinement", () => {
    const res = LandscapeEmbedContentV2.safeParse({
      schema_version: 2,
      queryA: "rail hydrogen",
      mode: "compare",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain(
        "compare mode requires queryA and queryB",
      );
    }
  });

  it("v2 focus-card without focusedNodeId fails the refinement", () => {
    const res = LandscapeEmbedContentV2.safeParse({
      schema_version: 2,
      display: "focus-card",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain(
        "focus-card display requires focusedNodeId",
      );
    }
  });

  it("v2 flythrough validates nested stops + clamps durations", () => {
    const res = LandscapeEmbedContentV2.safeParse({
      schema_version: 2,
      queryA: "rail",
      mode: "gravity",
      flythrough: {
        autoplay: true,
        loop: false,
        stops: [
          {
            kind: "cluster",
            clusterId: 0,
            caption: "Cluster 0",
            duration: 1500,
            transition: 1000,
          },
          { kind: "node", nodeId: "abc", caption: "A node", duration: 1200 },
        ],
      },
    });
    expect(res.success).toBe(true);
  });

  it("rejects v2 flythrough with duration below the 500 ms floor", () => {
    const res = LandscapeEmbedContentV2.safeParse({
      schema_version: 2,
      queryA: "rail",
      mode: "gravity",
      flythrough: {
        autoplay: false,
        loop: false,
        stops: [{ kind: "node", nodeId: "a", caption: "c", duration: 100 }],
      },
    });
    expect(res.success).toBe(false);
  });
});

describe("migrateLandscapeEmbedV1ToV2", () => {
  it("maps layout: 'umap' → mode: 'explore', cameraPreset: 'topdown'", () => {
    const v1 = LandscapeEmbedContentV1.parse({
      layout: "umap",
      schema_version: 1,
    });
    const v2 = migrateLandscapeEmbedV1ToV2(v1);
    expect(v2.mode).toBe("explore");
    expect(v2.cameraPreset).toBe("topdown");
    expect(v2.theme).toBe("light");
  });

  it("maps layout: 'web' + query → mode: 'gravity', cameraPreset: 'topdown'", () => {
    const v1 = LandscapeEmbedContentV1.parse({
      layout: "web",
      query: "rail",
      schema_version: 1,
    });
    const v2 = migrateLandscapeEmbedV1ToV2(v1);
    expect(v2.mode).toBe("gravity");
    expect(v2.queryA).toBe("rail");
    expect(v2.cameraPreset).toBe("topdown");
  });

  it("maps layout: 'rings' + query → mode: 'gravity', cameraPreset: 'fit'", () => {
    const v1 = LandscapeEmbedContentV1.parse({
      layout: "rings",
      query: "saf",
      schema_version: 1,
    });
    const v2 = migrateLandscapeEmbedV1ToV2(v1);
    expect(v2.mode).toBe("gravity");
    expect(v2.cameraPreset).toBe("fit");
  });
});
