"use client";

import {
  type LandscapeEdgeVisibility,
  type SimNode,
  initCanvas,
} from "@/components/landscape/canvas";
import { LANDSCAPE_SNAPSHOT } from "@/lib/landscape/snapshot";
import type {
  LandscapeData,
  LandscapeLink,
  LandscapeNode,
  LiveCallNode,
  ProjectNode,
} from "@/lib/landscape/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LandscapeCanvasEl = HTMLCanvasElement & {
  __allNodes?: SimNode[];
  __allLinks?: LandscapeLink[];
  __rebuildSim?: (nodes: SimNode[], links: LandscapeLink[]) => void;
  __setParticleSpeed?: (v: number) => void;
  __respawnParticlesForEdges?: () => void;
  __setLayoutSpreadMode?: (spread: boolean) => void;
};

function FilterBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.07)",
        border: active
          ? "1px solid #388bfd"
          : "0.5px solid rgba(255,255,255,0.15)",
        borderRadius: 6,
        padding: "6px 10px",
        color: active ? "#79c0ff" : "#c9d1d9",
        fontSize: 11,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      {label}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          color: "#6e7681",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span style={{ color: "#c9d1d9", fontSize: 12 }}>{value}</span>
    </div>
  );
}

function ConnectedNodes({
  node,
  allLinks,
  allNodes,
  edgeVisibility,
}: {
  node: LandscapeNode;
  allLinks: LandscapeLink[];
  allNodes: LandscapeNode[];
  edgeVisibility: LandscapeEdgeVisibility;
}) {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const connected = allLinks
    .filter((l) => edgeVisibility[l.edge_type])
    .filter((l) => l.source_id === node.id || l.target_id === node.id)
    .map((l) => ({
      link: l,
      other: nodeMap.get(l.source_id === node.id ? l.target_id : l.source_id),
    }))
    .filter(
      (x): x is { link: LandscapeLink; other: LandscapeNode } => !!x.other,
    )
    .sort((a, b) => (b.link.weight ?? 0) - (a.link.weight ?? 0))
    .slice(0, 5);

  if (connected.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          color: "#6e7681",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
        }}
      >
        Connected ({connected.length})
      </div>
      {connected.map(({ link, other }) => (
        <div
          key={`${other.id}-${link.source_id}-${link.target_id}-${link.edge_type}`}
          style={{
            padding: "6px 8px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 4,
            marginBottom: 4,
            borderLeft: `2px solid ${
              link.edge_type === "live_match" ? "#e3b341" : "#30363d"
            }`,
          }}
        >
          <div style={{ color: "#c9d1d9", fontSize: 11, marginBottom: 2 }}>
            {other.title.substring(0, 45)}
            {other.title.length > 45 ? "…" : ""}
          </div>
          <div style={{ color: "#6e7681", fontSize: 10 }}>
            {link.edge_type} ·{" "}
            {link.weight != null ? link.weight.toFixed(3) : "n/a"}
          </div>
        </div>
      ))}
    </div>
  );
}

const DEFAULT_EDGE_VISIBILITY: LandscapeEdgeVisibility = {
  shared_org: true,
  semantic_similarity: true,
  live_match: true,
};

export default function LandscapeV2() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const reheatRef = useRef<(() => void) | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const edgeVisRef = useRef<LandscapeEdgeVisibility>(DEFAULT_EDGE_VISIBILITY);
  const layoutSpreadRef = useRef(true);
  const [graphData, setGraphData] = useState<LandscapeData>(LANDSCAPE_SNAPSHOT);
  const [dataSource, setDataSource] = useState<"snapshot" | "live">("snapshot");
  const [isLoadingLive, setIsLoadingLive] = useState(true);
  const [forceSnapshot, setForceSnapshot] = useState(false);
  const [selectedNode, setSelectedNode] = useState<LandscapeNode | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [particleSpeed, setParticleSpeed] = useState(20);
  const [edgeVisibility, setEdgeVisibility] = useState<LandscapeEdgeVisibility>(
    DEFAULT_EDGE_VISIBILITY,
  );
  const [layoutSpread, setLayoutSpread] = useState(true);

  edgeVisRef.current = edgeVisibility;
  layoutSpreadRef.current = layoutSpread;

  const getEdgeVisibility = useCallback(() => edgeVisRef.current, []);
  const getLayoutSpread = useCallback(() => layoutSpreadRef.current, []);

  const patchEdgeVisibility = useCallback(
    (patch: Partial<LandscapeEdgeVisibility>) => {
      const next = { ...edgeVisRef.current, ...patch };
      edgeVisRef.current = next;
      setEdgeVisibility(next);
      queueMicrotask(() => {
        (
          canvasRef.current as LandscapeCanvasEl | null
        )?.__respawnParticlesForEdges?.();
      });
    },
    [],
  );

  const setLayoutSpreadAndApply = useCallback((spread: boolean) => {
    layoutSpreadRef.current = spread;
    setLayoutSpread(spread);
    queueMicrotask(() => {
      (canvasRef.current as LandscapeCanvasEl | null)?.__setLayoutSpreadMode?.(
        spread,
      );
    });
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedNode?.id ?? null;
  }, [selectedNode]);

  useEffect(() => {
    setActiveFilter("all");
  }, [graphData]);

  useEffect(() => {
    if (forceSnapshot) {
      setGraphData(LANDSCAPE_SNAPSHOT);
      setDataSource("snapshot");
      setIsLoadingLive(false);
      return;
    }
    setIsLoadingLive(true);
    fetch("/api/landscape/v2-data")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json() as Promise<LandscapeData>;
      })
      .then((data) => {
        setGraphData(data);
        setDataSource("live");
        setIsLoadingLive(false);
      })
      .catch(() => {
        setDataSource("snapshot");
        setIsLoadingLive(false);
      });
  }, [forceSnapshot]);

  const applyFilter = useCallback((filter: string) => {
    setActiveFilter(filter);
    const canvasEl = canvasRef.current as LandscapeCanvasEl | null;
    if (!canvasEl) return;
    const allNodes = canvasEl.__allNodes ?? [];
    const allLinks = canvasEl.__allLinks ?? [];
    const rebuild = canvasEl.__rebuildSim;
    if (!rebuild) return;

    let filtered: SimNode[] = allNodes;
    if (filter === "innovate_uk") {
      filtered = allNodes.filter(
        (n) =>
          n.type === "live_call" ||
          (n.type === "project" && n.lead_funder === "Innovate UK"),
      );
    } else if (filter === "epsrc") {
      filtered = allNodes.filter(
        (n) =>
          n.type === "live_call" ||
          (n.type === "project" && n.lead_funder === "EPSRC"),
      );
    } else if (filter === "iscf") {
      filtered = allNodes.filter(
        (n) =>
          n.type === "live_call" ||
          (n.type === "project" && n.lead_funder === "ISCF"),
      );
    } else if (filter === "live") {
      filtered = allNodes.filter((n) => n.type === "live_call");
    }

    const ids = new Set(filtered.map((n) => n.id));
    const links = allLinks.filter(
      (l) => ids.has(l.source_id) && ids.has(l.target_id),
    );
    rebuild(filtered, links);
  }, []);

  const handleParticleSpeed = useCallback((v: number) => {
    setParticleSpeed(v);
    (canvasRef.current as LandscapeCanvasEl | null)?.__setParticleSpeed?.(v);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    return initCanvas(el, graphData, {
      onNodeClick: (node) => setSelectedNode(node ?? null),
      getSelectedNodeId: () => selectedIdRef.current,
      onFitReady: (fit) => {
        fitRef.current = fit;
      },
      onReheatReady: (fn) => {
        reheatRef.current = fn;
      },
      initialParticleSlider: particleSpeed,
      getEdgeVisibility,
      getLayoutSpread,
    });
  }, [graphData, getEdgeVisibility, getLayoutSpread]);

  const projectCount = graphData.nodes.filter(
    (n) => n.type === "project",
  ).length;
  const liveCallCount = graphData.nodes.filter(
    (n) => n.type === "live_call",
  ).length;
  const visibleEdgeCount = useMemo(
    () => graphData.links.filter((l) => edgeVisibility[l.edge_type]).length,
    [graphData.links, edgeVisibility],
  );
  const snapshotDate = new Date(
    LANDSCAPE_SNAPSHOT.generatedAt,
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      style={{
        background: "#0d1117",
        width: "100%",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxWidth: 220,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <FilterBtn
          active={activeFilter === "all"}
          label="All nodes"
          onClick={() => applyFilter("all")}
        />
        <FilterBtn
          active={activeFilter === "innovate_uk"}
          label="Innovate UK"
          onClick={() => applyFilter("innovate_uk")}
        />
        <FilterBtn
          active={activeFilter === "epsrc"}
          label="EPSRC"
          onClick={() => applyFilter("epsrc")}
        />
        <FilterBtn
          active={activeFilter === "iscf"}
          label="ISCF"
          onClick={() => applyFilter("iscf")}
        />
        <FilterBtn
          active={activeFilter === "live"}
          label="Live calls only"
          onClick={() => applyFilter("live")}
        />
        <FilterBtn
          active={false}
          label="⊡ Fit view"
          onClick={() => fitRef.current?.()}
        />
        <FilterBtn
          active={false}
          label="↺ Reheat"
          onClick={() => reheatRef.current?.()}
        />
        <div
          style={{
            marginTop: 6,
            paddingTop: 8,
            borderTop: "0.5px solid rgba(255,255,255,0.12)",
          }}
        >
          <span
            style={{
              color: "#6e7681",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Layout
          </span>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              color: "#c9d1d9",
              fontSize: 11,
              cursor: "pointer",
              marginTop: 6,
              lineHeight: 1.35,
            }}
          >
            <input
              type="checkbox"
              checked={layoutSpread}
              onChange={() => setLayoutSpreadAndApply(!layoutSpreadRef.current)}
              style={{ marginTop: 2 }}
            />
            <span>
              Allow spread (collision separates overlaps). Off = strict UMAP
              scatter; you can still drag nodes.
            </span>
          </label>
        </div>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            color: "#8b949e",
            fontSize: 10,
            marginTop: 4,
          }}
        >
          Particle speed
          <input
            type="range"
            min={0}
            max={100}
            value={particleSpeed}
            onChange={(e) => handleParticleSpeed(Number(e.target.value))}
          />
        </label>
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "0.5px solid rgba(255,255,255,0.12)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span
            style={{
              color: "#6e7681",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Edges
          </span>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#c9d1d9",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={edgeVisibility.shared_org}
              onChange={() =>
                patchEdgeVisibility({
                  shared_org: !edgeVisRef.current.shared_org,
                })
              }
            />
            Shared org
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#c9d1d9",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={edgeVisibility.semantic_similarity}
              onChange={() =>
                patchEdgeVisibility({
                  semantic_similarity: !edgeVisRef.current.semantic_similarity,
                })
              }
            />
            Semantic similarity
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#c9d1d9",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={edgeVisibility.live_match}
              onChange={() =>
                patchEdgeVisibility({
                  live_match: !edgeVisRef.current.live_match,
                })
              }
            />
            Live match + particles
          </label>
        </div>
      </div>

      {selectedNode && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "320px",
            height: "100%",
            background: "rgba(13,17,23,0.96)",
            borderLeft: "0.5px solid rgba(255,255,255,0.12)",
            padding: "24px 20px",
            overflowY: "auto",
            fontFamily: "ui-monospace, monospace",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedNode(null)}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "none",
              border: "none",
              color: "#8b949e",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>

          <div
            style={{
              display: "inline-block",
              background:
                selectedNode.type === "project"
                  ? "rgba(63,185,80,0.15)"
                  : "rgba(227,179,65,0.15)",
              color: selectedNode.type === "project" ? "#3fb950" : "#e3b341",
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              alignSelf: "flex-start",
              marginTop: 8,
            }}
          >
            {selectedNode.type === "project" ? "GtR Project" : "Live Call"}
          </div>

          <div
            style={{
              color: "#e6edf3",
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {selectedNode.title}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedNode.type === "project" ? (
              <>
                {(selectedNode as ProjectNode).lead_funder && (
                  <DetailRow
                    label="Funder"
                    value={(selectedNode as ProjectNode).lead_funder ?? ""}
                  />
                )}
                {(selectedNode as ProjectNode).score != null && (
                  <DetailRow
                    label="Relevance"
                    value={`${(
                      ((selectedNode as ProjectNode).score ?? 0) * 100
                    ).toFixed(1)}%`}
                  />
                )}
                {(selectedNode as ProjectNode).x != null &&
                  (selectedNode as ProjectNode).y != null && (
                    <DetailRow
                      label="UMAP"
                      value={`${(selectedNode as ProjectNode).x?.toFixed(1)}, ${(selectedNode as ProjectNode).y?.toFixed(1)}`}
                    />
                  )}
              </>
            ) : (
              <>
                {(selectedNode as LiveCallNode).funder && (
                  <DetailRow
                    label="Funder"
                    value={(selectedNode as LiveCallNode).funder ?? ""}
                  />
                )}
                {(selectedNode as LiveCallNode).status && (
                  <DetailRow
                    label="Status"
                    value={(selectedNode as LiveCallNode).status ?? ""}
                  />
                )}
                {(selectedNode as LiveCallNode).deadline && (
                  <DetailRow
                    label="Deadline"
                    value={(selectedNode as LiveCallNode).deadline ?? ""}
                  />
                )}
                {(selectedNode as LiveCallNode).source && (
                  <DetailRow
                    label="Source"
                    value={(selectedNode as LiveCallNode).source ?? ""}
                  />
                )}
              </>
            )}
          </div>

          <ConnectedNodes
            node={selectedNode}
            allLinks={graphData.links}
            allNodes={graphData.nodes}
            edgeVisibility={edgeVisibility}
          />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-end",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "0.5px solid rgba(255,255,255,0.15)",
            borderRadius: 6,
            padding: "4px 10px",
            color: "#8b949e",
            fontSize: 11,
          }}
        >
          {projectCount} projects · {liveCallCount} live calls ·{" "}
          {visibleEdgeCount} edges shown
          {visibleEdgeCount !== graphData.links.length ? (
            <span style={{ color: "#6e7681" }}>
              {" "}
              ({graphData.links.length} total)
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setForceSnapshot((prev) => !prev)}
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "0.5px solid rgba(255,255,255,0.15)",
            borderRadius: 6,
            padding: "4px 10px",
            color: "#e6edf3",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <span
            style={{
              color: dataSource === "live" ? "#3fb950" : "#e3b341",
            }}
          >
            ●
          </span>{" "}
          {dataSource === "live"
            ? isLoadingLive
              ? "Loading live..."
              : "Live"
            : `Snapshot · ${snapshotDate}`}
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          background: "rgba(255,255,255,0.07)",
          border: "0.5px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
          padding: "10px 14px",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {[
          { label: "Innovate UK", colour: "#3fb950" },
          { label: "EPSRC", colour: "#a371f7" },
          { label: "ISCF / UKRI", colour: "#388bfd" },
          { label: "Horizon Europe", colour: "#58a6ff" },
          { label: "Other", colour: "#f0883e" },
          { label: "⬡ Live call", colour: "#e3b341" },
        ].map(({ label, colour }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: colour,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#8b949e", fontSize: 11 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
