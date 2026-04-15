"use client";

import type { ForceGraphMethods } from "react-force-graph-3d";
import type {
  LandscapeData,
  LandscapeLink,
  LandscapeNode,
} from "@/lib/landscape/types";
import { LANDSCAPE_SNAPSHOT } from "@/lib/landscape/snapshot";
import type { Root } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

const FUNDER_COLOURS: Record<string, string> = {
  "Innovate UK": "#3fb950",
  EPSRC: "#a371f7",
  ISCF: "#388bfd",
  ESRC: "#f0883e",
  AHRC: "#f0883e",
  "Horizon Europe Guarantee": "#58a6ff",
  MRC: "#f0883e",
  NERC: "#f0883e",
};

const LIVE_CALL_COLOURS: Record<string, string> = {
  horizon_europe: "#58a6ff",
  innovate_uk: "#3fb950",
  find_a_tender: "#e3b341",
};

function hashUmapComponent(id: string, axis: "x" | "y"): number {
  const seed = `${id}:${axis}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 10001) / 100;
}

type Graph3DNode = LandscapeNode & {
  x: number;
  y: number;
  z: number;
  color: string;
  val: number;
};

type Graph3DLink = {
  source: string;
  target: string;
  color: string;
  particles: number;
};

function buildGraphData(data: LandscapeData): {
  nodes: Graph3DNode[];
  links: Graph3DLink[];
} {
  const graphNodes: Graph3DNode[] = data.nodes.map((n) => {
    const ux = n.x ?? hashUmapComponent(n.id, "x");
    const uy = n.y ?? hashUmapComponent(n.id, "y");
    const x = (ux - 50) * 8;
    const y = (uy - 50) * 8;
    const z = n.type === "project" ? ((n.score ?? 0.7) - 0.6) * 200 : 50;
    const color =
      n.type === "live_call"
        ? (LIVE_CALL_COLOURS[n.source ?? ""] ?? "#e3b341")
        : (FUNDER_COLOURS[n.lead_funder ?? ""] ?? "#6e7681");
    const val =
      n.type === "live_call" ? 4 : Math.max(0.5, ((n.score ?? 0.7) - 0.7) * 20);
    return { ...n, x, y, z, color, val };
  });

  const nodeById = new Map(graphNodes.map((n) => [n.id, n]));
  const graphLinks: Graph3DLink[] = data.links
    .filter(
      (l: LandscapeLink) =>
        nodeById.has(l.source_id) && nodeById.has(l.target_id),
    )
    .map((l: LandscapeLink) => ({
      source: l.source_id,
      target: l.target_id,
      color:
        l.edge_type === "live_match"
          ? "rgba(88,166,255,0.6)"
          : l.edge_type === "shared_org"
            ? "rgba(63,185,80,0.4)"
            : "rgba(139,148,158,0.15)",
      particles: l.edge_type === "live_match" ? 2 : 0,
    }));

  return { nodes: graphNodes, links: graphLinks };
}

export default function Landscape3DPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<Graph3DNode, Graph3DLink> | undefined>(
    undefined,
  );
  const [nodeCount, setNodeCount] = useState(0);
  const [linkCount, setLinkCount] = useState(0);
  const [dimensions, setDimensions] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setDimensions({
        w: Math.max(320, Math.floor(r.width)),
        h: Math.max(320, Math.floor(r.height)),
      });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setDimensions({
      w: Math.max(320, Math.floor(r.width)),
      h: Math.max(320, Math.floor(r.height)),
    });

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let root: Root | null = null;

    const run = async () => {
      const [{ default: ForceGraph3D }, { createRoot }] = await Promise.all([
        import("react-force-graph-3d"),
        import("react-dom/client"),
      ]);
      if (cancelled || !containerRef.current) return;

      const data = LANDSCAPE_SNAPSHOT;
      const { nodes: graphNodes, links: graphLinks } = buildGraphData(data);

      setNodeCount(graphNodes.length);
      setLinkCount(graphLinks.length);

      root = createRoot(containerRef.current);
      root.render(
        <ForceGraph3D<Graph3DNode, Graph3DLink>
          ref={
            fgRef as MutableRefObject<
              ForceGraphMethods<Graph3DNode, Graph3DLink> | undefined
            >
          }
          graphData={{ nodes: graphNodes, links: graphLinks }}
          width={dimensions.w}
          height={dimensions.h}
          backgroundColor="#0d1117"
          nodeColor="color"
          nodeVal="val"
          nodeLabel={(node) => `
              <div style="
                background:rgba(13,17,23,0.95);
                border:0.5px solid rgba(255,255,255,0.15);
                border-radius:6px;padding:6px 10px;
                font-family:ui-monospace,monospace;font-size:12px;
                color:#e6edf3;max-width:280px;line-height:1.5;
              ">
                <strong>${escapeAttr(node.title)}</strong><br>
                <span style="color:#8b949e">${escapeAttr(node.lead_funder ?? node.funder ?? "")}</span>
                ${node.type === "live_call" ? '<br><span style="color:#e3b341">● LIVE CALL</span>' : ""}
                ${node.type === "project" && node.score != null ? `<br><span style="color:#8b949e">Score: ${node.score.toFixed(3)}</span>` : ""}
              </div>
            `}
          linkColor="color"
          linkWidth={(link) => (link.particles > 0 ? 1.5 : 0.5)}
          linkDirectionalParticles={(link) => link.particles}
          linkDirectionalParticleSpeed={0.003}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => "#79c0ff"}
          onNodeClick={(node) => {
            const g = fgRef.current;
            if (!g) return;
            const px = node.x ?? 0;
            const py = node.y ?? 0;
            const pz = node.z ?? 0;
            const dist = 120;
            g.cameraPosition(
              { x: px + dist * 0.5, y: py + dist * 0.45, z: pz + dist },
              { x: px, y: py, z: pz },
              1500,
            );
          }}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />,
      );
    };

    void run();

    return () => {
      cancelled = true;
      root?.unmount();
      root = null;
      fgRef.current = undefined;
    };
  }, [dimensions.w, dimensions.h]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background: "#0d1117",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(13,17,23,0.8)",
          border: "0.5px solid rgba(255,255,255,0.12)",
          borderRadius: 6,
          padding: "6px 12px",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
        }}
      >
        {nodeCount} nodes · {linkCount} links · 3D
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          background: "rgba(13,17,23,0.8)",
          border: "0.5px solid rgba(255,255,255,0.12)",
          borderRadius: 6,
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {[
          { color: "#3fb950", label: "Innovate UK" },
          { color: "#a371f7", label: "EPSRC" },
          { color: "#388bfd", label: "ISCF" },
          { color: "#f0883e", label: "Other research" },
          { color: "#58a6ff", label: "Open live call" },
        ].map(({ color, label }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
              }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function escapeAttr(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
