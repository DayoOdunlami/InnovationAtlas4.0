// ---------------------------------------------------------------------------
// Landscape-embed read-only RSC renderer (Phase 3b + Phase 3d).
//
// Share scope MUST NOT ship three.js / d3-force / react-force-graph-3d
// (Phase 3b Design Constraint 3, reaffirmed in Phase 3d §9). This
// server component renders:
//
//   * `display: "graph"` — a **static SVG snapshot** (dark + light +
//     print variants) composed entirely in RSC, using the v2 theme
//     tokens.
//   * `display: "focus-card"` — a server-rendered card (delegates to
//     `LandscapeFocusCardRenderer`). No WebGL, no `three` import.
//   * `display: "graph-with-focus"` — stacks the SVG snapshot above
//     the focus card. On narrow viewports the flex wraps.
//
// v1 content (schema_version = 1 with `layout: web|umap|rings`) is
// accepted and rendered via the v2 path after an in-module migration.
// ---------------------------------------------------------------------------

import {
  normaliseLandscapeEmbedContent,
  type LandscapeEmbedViewModel,
} from "../types";
import {
  LandscapeFocusCardRenderer,
  landscapeFreshnessMeta,
} from "./landscape-focus-card.server";

export function LandscapeEmbedBlockRenderer({
  id,
  content,
}: {
  id: string;
  content: unknown;
}) {
  const vm = normaliseLandscapeEmbedContent(content);

  if (vm.display === "focus-card") {
    return <LandscapeFocusCardRenderer id={id} content={content} />;
  }
  if (vm.display === "graph-with-focus") {
    return (
      <div
        data-block-id={id}
        data-block-type="landscape-embed"
        data-display="graph-with-focus"
        data-theme={vm.theme}
        className="flex flex-col gap-3 md:flex-row"
      >
        <div className="md:flex-1">
          <GraphSnapshot id={id + "-snap"} vm={vm} />
        </div>
        <div className="md:w-[340px]">
          <LandscapeFocusCardRenderer id={id} content={content} embedded />
        </div>
      </div>
    );
  }
  return <GraphSnapshot id={id} vm={vm} />;
}

function GraphSnapshot({
  id,
  vm,
}: {
  id: string;
  vm: LandscapeEmbedViewModel;
}) {
  const query = vm.queryA ?? null;
  const tokens = themeTokensServer(vm.theme);
  const meta = landscapeFreshnessMeta();

  return (
    <figure
      data-block-id={id}
      data-block-type="landscape-embed"
      data-display={vm.display}
      data-mode={vm.mode}
      data-theme={vm.theme}
      // Legacy data-layout kept so existing Phase 3b tests continue to pass.
      data-layout={legacyLayoutFor(vm)}
      className="overflow-hidden rounded-md border"
      style={{ background: tokens.bg0, borderColor: tokens.rule }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2 text-xs"
        style={{ borderColor: tokens.rule, color: tokens.inkDim }}
      >
        <span
          className="font-['Fraunces'] text-[13px]"
          style={{ color: tokens.ink }}
        >
          Atlas{" "}
          <em className="not-italic" style={{ color: tokens.queryA }}>
            Network
          </em>
          <span
            className="ml-2 border px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
            style={{ borderColor: tokens.rule }}
          >
            {vm.mode}
          </span>
        </span>
        {query ? (
          <span
            className="font-mono text-[10px]"
            style={{ color: tokens.queryA }}
          >
            A · {query.slice(0, 48)}
          </span>
        ) : (
          <span
            className="font-mono text-[10px]"
            style={{ color: tokens.inkDim }}
          >
            UMAP · explore
          </span>
        )}
      </div>
      <div className="relative aspect-[16/9] w-full">
        <LandscapeSnapshotSvg vm={vm} query={query} />
      </div>
      {vm.caption ? (
        <figcaption
          className="border-t px-3 py-1.5 text-[11px] leading-relaxed"
          style={{ borderColor: tokens.rule, color: tokens.inkDim }}
        >
          {vm.caption}
        </figcaption>
      ) : null}
      <figcaption
        className="border-t px-3 py-1.5 text-[10px]"
        style={{ borderColor: tokens.rule, color: tokens.inkDim }}
      >
        Landscape as of {meta.generatedAt.slice(0, 10)} · {meta.projects}{" "}
        projects · {meta.liveCalls} live calls · Open on Atlas to interact with
        the live lens.
      </figcaption>
    </figure>
  );
}

function legacyLayoutFor(
  vm: LandscapeEmbedViewModel,
): "web" | "umap" | "rings" {
  if (vm.mode === "explore") return "umap";
  if (vm.cameraPreset === "fit") return "rings";
  return "web";
}

function LandscapeSnapshotSvg({
  vm,
  query,
}: {
  vm: LandscapeEmbedViewModel;
  query: string | null;
}) {
  const tokens = themeTokensServer(vm.theme);
  const mode = vm.mode;
  const seed = hash((query ?? "") + "|" + mode + "|" + vm.theme);
  const rng = seededRandom(seed);
  const dots: { x: number; y: number; r: number; c: string; o: number }[] = [];
  const total = 120;
  for (let i = 0; i < total; i += 1) {
    let x = rng() * 1200 + 40;
    let y = rng() * 340 + 40;
    const isLive = rng() < 0.15;
    const affinity = query ? rng() : 1;
    let colour = isLive ? tokens.live : tokens.project;
    let opacity = 0.9;
    if (query) {
      if (mode === "compare") {
        // Binary-star split across the x axis.
        const side = rng() < 0.5 ? -1 : 1;
        const radius = (1 - affinity) * 260 + 20;
        const angle = rng() * Math.PI * 2;
        x = 640 + side * 240 + Math.cos(angle) * radius * 0.4;
        y = 210 + Math.sin(angle) * radius * 0.55;
        colour = side === -1 ? tokens.queryA : tokens.queryB;
        if (affinity < 0.25) {
          colour = tokens.dim;
          opacity = 0.45;
        }
      } else if (mode === "gravity") {
        const radius = (1 - affinity) * 220 + 24;
        const angle = rng() * Math.PI * 2;
        x = 640 + Math.cos(angle) * radius;
        y = 210 + Math.sin(angle) * radius * 0.78;
        if (affinity < 0.3) {
          colour = tokens.dim;
          opacity = 0.55;
        }
      } else if (affinity < 0.3) {
        colour = tokens.dim;
        opacity = 0.55;
      }
    }
    dots.push({
      x,
      y,
      r: isLive ? 4.5 : 2 + affinity * 2,
      c: colour,
      o: opacity,
    });
  }

  const labelText = query
    ? `Atlas landscape — ${mode} layout around "${query}"`
    : `Atlas landscape — UMAP snapshot`;

  return (
    <svg
      viewBox="0 0 1280 420"
      xmlns="http://www.w3.org/2000/svg"
      className="block h-full w-full"
      role="img"
      aria-label={labelText}
    >
      <rect x={0} y={0} width={1280} height={420} fill={tokens.bg0} />
      <defs>
        <pattern
          id={`grid-${vm.theme}-${mode}`}
          x={0}
          y={0}
          width={60}
          height={60}
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 60 0 L 0 0 0 60"
            fill="none"
            stroke={tokens.grid}
            strokeWidth={1}
          />
        </pattern>
        <radialGradient id={`glow-${vm.theme}-${mode}`} cx="50%" cy="50%">
          <stop offset="0%" stopColor={tokens.glowInner} />
          <stop offset="100%" stopColor={tokens.glowOuter} />
        </radialGradient>
      </defs>
      {vm.theme !== "print" ? (
        <rect
          x={0}
          y={0}
          width={1280}
          height={420}
          fill={`url(#grid-${vm.theme}-${mode})`}
        />
      ) : null}
      {query && mode === "gravity" ? (
        <>
          <circle
            cx={640}
            cy={210}
            r={220}
            fill={`url(#glow-${vm.theme}-${mode})`}
          />
          {[80, 160, 220].map((r) => (
            <circle
              key={r}
              cx={640}
              cy={210}
              r={r}
              fill="none"
              stroke={tokens.ring}
              strokeWidth={1}
            />
          ))}
          <circle cx={640} cy={210} r={6} fill={tokens.queryA} />
        </>
      ) : null}
      {query && mode === "compare" ? (
        <>
          <line
            x1={400}
            y1={210}
            x2={880}
            y2={210}
            stroke={tokens.axis}
            strokeWidth={1.5}
          />
          <circle cx={400} cy={210} r={10} fill={tokens.queryA} />
          <circle cx={880} cy={210} r={10} fill={tokens.queryB} />
          <text
            x={400}
            y={184}
            textAnchor="middle"
            fill={tokens.queryA}
            fontFamily="JetBrains Mono, monospace"
            fontSize={11}
          >
            QUERY A
          </text>
          <text
            x={880}
            y={184}
            textAnchor="middle"
            fill={tokens.queryB}
            fontFamily="JetBrains Mono, monospace"
            fontSize={11}
          >
            QUERY B
          </text>
        </>
      ) : null}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.o} />
      ))}
    </svg>
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function themeTokensServer(theme: LandscapeEmbedViewModel["theme"]) {
  if (theme === "dark") {
    return {
      bg0: "#0a0e13",
      ink: "#e8ecf1",
      inkDim: "#8a96a8",
      rule: "#253040",
      grid: "rgba(143,228,177,0.04)",
      project: "#8fe4b1",
      live: "#f5b547",
      queryA: "#8fe4b1",
      queryB: "#b69afc",
      dim: "#3c4a5a",
      ring: "rgba(255,107,74,0.22)",
      axis: "rgba(182,154,252,0.35)",
      glowInner: "rgba(143,228,177,0.18)",
      glowOuter: "rgba(143,228,177,0)",
    };
  }
  if (theme === "print") {
    return {
      bg0: "#ffffff",
      ink: "#000000",
      inkDim: "#333333",
      rule: "#bbbbbb",
      grid: "transparent",
      project: "#1f6b47",
      live: "#8a5f10",
      queryA: "#1f6b47",
      queryB: "#4a3099",
      dim: "#bbbbbb",
      ring: "rgba(0,0,0,0.25)",
      axis: "rgba(74,48,153,0.45)",
      glowInner: "rgba(0,0,0,0.06)",
      glowOuter: "rgba(0,0,0,0)",
    };
  }
  return {
    bg0: "#f7f8f9",
    ink: "#1a2230",
    inkDim: "#4a5566",
    rule: "#d4d8de",
    grid: "rgba(34,97,63,0.08)",
    project: "#2d9163",
    live: "#c38720",
    queryA: "#2d9163",
    queryB: "#6a4bcf",
    dim: "#aab4c4",
    ring: "rgba(204,74,43,0.28)",
    axis: "rgba(106,75,207,0.35)",
    glowInner: "rgba(45,145,99,0.16)",
    glowOuter: "rgba(45,145,99,0)",
  };
}
