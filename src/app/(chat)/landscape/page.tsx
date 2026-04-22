"use client";

import type { LandscapeGroupBy } from "@/components/landscape/landscape-force-graph";
import { LandscapeScatterLazy } from "@/components/landscape/landscape-scatter-lazy";
import { LegacyBanner } from "@/components/landscape/legacy-banner";
import { Loader2, Map, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Lazy-load force graph (canvas, no SSR)
const LandscapeForceGraph = dynamic(
  () =>
    import("@/components/landscape/landscape-force-graph").then(
      (m) => m.LandscapeForceGraph,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading force graph…
      </div>
    ),
  },
);

const MODES = ["All", "Rail", "Aviation", "Maritime", "Highways"] as const;
type Mode = (typeof MODES)[number];

const EDGE_LEGEND = [
  { label: "Shared organisation", color: "#6366f1", dash: "" },
  { label: "Semantic similarity", color: "#8b5cf6", dash: "4 4" },
  { label: "Shared topics", color: "#a78bfa", dash: "1 3" },
  { label: "Live call opportunity", color: "#f59e0b", dash: "6 3" },
] as const;

export default function LandscapePage() {
  const [view, setView] = useState<"scatter" | "force">("scatter");
  const [modeFilter, setModeFilter] = useState<Mode>("All");
  const [showLiveCalls, setShowLiveCalls] = useState(true);
  const [showOrganisations, setShowOrganisations] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [groupBy, setGroupBy] = useState<LandscapeGroupBy>("semantic");
  const [demoHighlightTheme, setDemoHighlightTheme] = useState<string | null>(
    null,
  );
  const [demoZoomNodeId, setDemoZoomNodeId] = useState<string | null>(null);
  const [demoZoomTrigger, setDemoZoomTrigger] = useState(0);

  useEffect(() => {
    const onHighlight = (e: Event) => {
      const theme = (e as CustomEvent<{ theme?: string }>).detail?.theme;
      if (typeof theme === "string" && theme.trim()) {
        setDemoHighlightTheme(theme.trim());
      }
    };
    const onZoom = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (typeof nodeId === "string" && nodeId.trim()) {
        setDemoZoomNodeId(nodeId.trim());
        setDemoZoomTrigger((n) => n + 1);
      }
    };
    window.addEventListener("demo:highlight", onHighlight);
    window.addEventListener("demo:zoom", onZoom);
    return () => {
      window.removeEventListener("demo:highlight", onHighlight);
      window.removeEventListener("demo:zoom", onZoom);
    };
  }, []);

  useEffect(() => {
    console.warn(
      "[/landscape] legacy exploratory route — superseded by /landscape-3d. See docs/canvas-status-and-roadmap.md",
    );
  }, []);

  const isForce = view === "force";

  return (
    <div className="flex flex-col h-full">
      <LegacyBanner
        message="Exploratory variant — superseded by /landscape-3d"
        docHref="/landscape-3d"
      />
      <div className="flex flex-1 min-h-0 flex-col px-4 py-4">
        {/* Page header */}
        <div className="flex items-center gap-2 mb-3">
          <Map className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Innovation Landscape</h1>
          <p className="text-sm text-muted-foreground ml-2 hidden sm:block">
            Semantic map of 622 cross-sector projects + live Horizon Europe
            calls
          </p>
        </div>

        {/* Filter + view bar */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {/* Mode buttons */}
          <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5 bg-muted/30">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModeFilter(m)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  modeFilter === m
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Live calls toggle */}
          <button
            type="button"
            onClick={() => setShowLiveCalls((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg border font-medium transition-colors ${
              showLiveCalls
                ? "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className={`size-2 rounded-sm rotate-45 inline-block ${showLiveCalls ? "bg-amber-500" : "bg-muted-foreground"}`}
            />
            Show live calls
          </button>

          <button
            type="button"
            onClick={() => setShowOrganisations((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg border font-medium transition-colors ${
              showOrganisations
                ? "bg-violet-50 border-violet-300 text-violet-800 dark:bg-violet-950/40 dark:border-violet-700 dark:text-violet-200"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className={`size-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-current inline-block ${showOrganisations ? "text-violet-600" : "text-muted-foreground"}`}
            />
            Show organisations
          </button>

          {/* Group by — force graph layout / clustering */}
          {isForce && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 px-2 py-1 bg-muted/20">
              <span className="text-[11px] text-muted-foreground font-medium">
                Group by
              </span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as LandscapeGroupBy)}
                className="text-xs rounded-md border border-border/60 bg-background px-2 py-1 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="semantic">Semantic</option>
                <option value="funder">Funder</option>
                <option value="theme">Theme</option>
              </select>
              <button
                type="button"
                onClick={() => setGroupBy("semantic")}
                className="text-[11px] px-2 py-0.5 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Reset to semantic
              </button>
            </div>
          )}

          {/* View toggle — pushed to right */}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/60 p-0.5 bg-muted/30">
            <button
              type="button"
              onClick={() => setView("scatter")}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                view === "scatter"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Scatter
            </button>
            <button
              type="button"
              onClick={() => setView("force")}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                view === "force"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Force Graph
            </button>
          </div>
        </div>

        {/* Edge legend — force graph only */}
        {isForce && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 px-1">
            {EDGE_LEGEND.map(({ label, color, dash }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <svg width="24" height="10" viewBox="0 0 24 10">
                  <line
                    x1="0"
                    y1="5"
                    x2="24"
                    y2="5"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeDasharray={dash}
                    strokeOpacity="0.9"
                  />
                </svg>
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Search bar — force graph only */}
        {isForce && (
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearchTrigger((t) => t + 1);
                if (e.key === "Escape") setSearchTerm("");
              }}
              placeholder="Search projects and calls… (Enter to zoom)"
              className="w-full pl-8 pr-4 py-1.5 text-xs rounded-lg border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Chart area */}
        <div
          className={`flex-1 min-h-0 rounded-xl border border-border/60 bg-card/60 overflow-hidden ${
            isForce ? "" : "p-4"
          }`}
        >
          {isForce ? (
            <LandscapeForceGraph
              modeFilter={modeFilter}
              showLiveCalls={showLiveCalls}
              searchTerm={searchTerm}
              searchTrigger={searchTrigger}
              groupBy={groupBy}
              demoZoomNodeId={demoZoomNodeId}
              demoZoomTrigger={demoZoomTrigger}
            />
          ) : (
            <LandscapeScatterLazy
              modeFilter={modeFilter}
              showLiveCalls={showLiveCalls}
              showOrganisations={showOrganisations}
              highlightTheme={demoHighlightTheme}
            />
          )}
        </div>
      </div>
    </div>
  );
}
