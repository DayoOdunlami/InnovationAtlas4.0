// ---------------------------------------------------------------------------
// Landscape-embed read-only RSC renderer (Phase 3b).
//
// Share scope MUST NOT ship three.js / d3-force / react-force-graph-3d
// (Phase 3b execution prompt Design Constraint 3). This server
// component renders a **static snapshot thumbnail** — an SVG composed
// entirely in RSC, with:
//
//   * the block's saved query (if any), layout, and optional title
//   * an SVG-drawn representation of the force graph that matches the
//     POC's visual vocabulary (dark slate background, dot nodes, grid)
//     so share recipients see production-shaped artefacts rather than
//     empty placeholders.
//
// The live interactive lens only renders on the owner-scope editable
// mount, gated behind `next/dynamic({ ssr: false })`.
// ---------------------------------------------------------------------------

import type { LandscapeEmbedContent } from "../types";

export function LandscapeEmbedBlockRenderer({
  id,
  content,
}: {
  id: string;
  content: unknown;
}) {
  const c = (content ?? {}) as Partial<LandscapeEmbedContent>;
  const query = typeof c.query === "string" ? c.query : null;
  const layout = c.layout === "web" || c.layout === "rings" ? c.layout : "umap";
  const lens = typeof c.lens === "string" ? c.lens : "force-graph";

  return (
    <figure
      data-block-id={id}
      data-block-type="landscape-embed"
      data-lens={lens}
      data-layout={layout}
      className="overflow-hidden rounded-md border border-border bg-[#0a0e13]"
    >
      <div className="flex items-center justify-between border-b border-[#253040] px-3 py-2 text-xs text-[#8a96a8]">
        <span className="font-['Fraunces'] text-[13px] text-[#e8ecf1]">
          Atlas <em className="not-italic text-[#8fe4b1]">Network</em>
          <span className="ml-2 border border-[#253040] px-1.5 py-0.5 text-[9px] uppercase tracking-widest">
            {layout}
          </span>
        </span>
        {query ? (
          <span className="font-mono text-[10px] text-[#8fe4b1]">
            A · {query.slice(0, 48)}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-[#8a96a8]">
            UMAP · explore
          </span>
        )}
      </div>
      <div className="relative aspect-[16/9] w-full">
        <LandscapeSnapshotSvg query={query} layout={layout} />
      </div>
      <figcaption className="border-t border-[#253040] px-3 py-1.5 text-[10px] text-[#8a96a8]">
        Static snapshot · Open on Atlas to interact with the live lens.
      </figcaption>
    </figure>
  );
}

function LandscapeSnapshotSvg({
  query,
  layout,
}: {
  query: string | null;
  layout: "web" | "umap" | "rings";
}) {
  // Deterministic stylised thumbnail. This is intentionally SVG (no
  // JavaScript): share recipients must not load the client lens at
  // all. The dots are positioned via a cheap pseudo-random function
  // seeded by the query so the same block always renders the same
  // thumbnail.
  const seed = hash((query ?? "") + "|" + layout);
  const rng = seededRandom(seed);
  const dots: { x: number; y: number; r: number; c: string; o: number }[] = [];
  const LIVE = "#f5b547";
  const PROJECT = "#8fe4b1";
  const DIM = "#3c4a5a";
  const total = 120;
  for (let i = 0; i < total; i += 1) {
    let x = rng() * 1200 + 40;
    let y = rng() * 340 + 40;
    const isLive = rng() < 0.15;
    const affinity = query ? rng() : 1;
    let colour = isLive ? LIVE : PROJECT;
    let opacity = 0.9;
    if (query) {
      if (layout === "rings") {
        const ring = Math.floor(rng() * 3);
        const radius = 40 + ring * 80;
        const angle = rng() * Math.PI * 2;
        x = 620 + Math.cos(angle) * radius;
        y = 210 + Math.sin(angle) * radius;
        if (affinity < 0.3) {
          colour = DIM;
          opacity = 0.5;
        }
      } else if (layout === "web") {
        const radius = (1 - affinity) * 200 + 20;
        const angle = rng() * Math.PI * 2;
        x = 620 + Math.cos(angle) * radius;
        y = 210 + Math.sin(angle) * radius * 0.75;
      } else if (affinity < 0.3) {
        colour = DIM;
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

  return (
    <svg
      viewBox="0 0 1280 420"
      xmlns="http://www.w3.org/2000/svg"
      className="block h-full w-full"
      role="img"
      aria-label={
        query
          ? `Atlas landscape — ${layout} layout around "${query}"`
          : `Atlas landscape — UMAP snapshot`
      }
    >
      <rect x={0} y={0} width={1280} height={420} fill="#0a0e13" />
      <defs>
        <pattern
          id={`grid-${layout}`}
          x={0}
          y={0}
          width={60}
          height={60}
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 60 0 L 0 0 0 60"
            fill="none"
            stroke="rgba(143,228,177,0.04)"
            strokeWidth={1}
          />
        </pattern>
        <radialGradient id={`glow-${layout}`} cx="50%" cy="50%">
          <stop offset="0%" stopColor="rgba(143,228,177,0.18)" />
          <stop offset="100%" stopColor="rgba(143,228,177,0)" />
        </radialGradient>
      </defs>
      <rect
        x={0}
        y={0}
        width={1280}
        height={420}
        fill={`url(#grid-${layout})`}
      />
      {query && layout !== "umap" && (
        <>
          <circle cx={620} cy={210} r={220} fill={`url(#glow-${layout})`} />
          {layout === "rings" &&
            [80, 160, 220].map((r) => (
              <circle
                key={r}
                cx={620}
                cy={210}
                r={r}
                fill="none"
                stroke="rgba(255,107,74,0.22)"
                strokeWidth={1}
              />
            ))}
          <circle cx={620} cy={210} r={6} fill="#8fe4b1" />
        </>
      )}
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
