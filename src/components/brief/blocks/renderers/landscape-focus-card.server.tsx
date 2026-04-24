// ---------------------------------------------------------------------------
// landscape-embed "focus-card" RSC renderer (Phase 3d §6).
//
// When the block sets `display: "focus-card"` we render a rich
// semantic card with no WebGL, no client hooks, and (most importantly)
// no `three` import — this keeps share-scope briefs RSC-friendly and
// letter-paper-ready.
//
// Data resolution: the block stores only `focusedNodeId` + the
// surrounding view context (queries, caption). We re-resolve node
// details at render time from the frozen `LANDSCAPE_SNAPSHOT`, which
// is the same corpus the interactive lens reads by default. A
// live-API fallback can be slotted in here later without changing
// callers because the block payload never embedded the node blob.
//
// Absent/unknown nodes render a graceful "Node no longer in landscape"
// placeholder rather than throwing — briefs must stay shareable.
// ---------------------------------------------------------------------------

import { LANDSCAPE_SNAPSHOT } from "@/lib/landscape/snapshot";
import type { LandscapeNode } from "@/lib/landscape/types";
import {
  normaliseLandscapeEmbedContent,
  type LandscapeEmbedViewModel,
} from "../types";

type FocusCardProps = {
  id: string;
  content: unknown;
  isOwner?: boolean;
  /** When `graph-with-focus`, the card renders inline — no outer figure. */
  embedded?: boolean;
};

function lookupNode(id: string | undefined): LandscapeNode | null {
  if (!id) return null;
  return (
    (LANDSCAPE_SNAPSHOT.nodes as LandscapeNode[]).find((n) => n.id === id) ??
    null
  );
}

function findNeighbourIds(nodeId: string): string[] {
  const ids = new Set<string>();
  for (const l of LANDSCAPE_SNAPSHOT.links) {
    if (l.source_id === nodeId) ids.add(l.target_id);
    else if (l.target_id === nodeId) ids.add(l.source_id);
    if (ids.size >= 5) break;
  }
  return Array.from(ids);
}

function scorePct(n: LandscapeNode): number {
  if (n.type === "project" && typeof n.score === "number") {
    return Math.round(Math.max(0, Math.min(1, n.score)) * 100);
  }
  return 0;
}

// Deterministic token-overlap similarity — matches the POC
// `computeSimilarity` primitive so the bar shown in the card is
// consistent with what the lens would render when Query A is active.
function similarityAgainstQuery(
  q: string | undefined,
  n: LandscapeNode,
): number {
  if (!q) return 0;
  const tokens = q
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  if (tokens.length === 0) return 0;
  const title = (n.title ?? "").toLowerCase();
  const extra =
    n.type === "project" && n.lead_funder
      ? n.lead_funder.toLowerCase()
      : n.type === "live_call" && "funder" in n && n.funder
        ? n.funder.toLowerCase()
        : "";
  const text = `${title} ${extra}`;
  let hits = 0;
  for (const t of tokens) if (text.includes(t)) hits += 1;
  return Math.min(1, hits / tokens.length);
}

export function LandscapeFocusCardRenderer(props: FocusCardProps) {
  const { id, content, embedded = false } = props;
  const vm = normaliseLandscapeEmbedContent(content);
  const node = lookupNode(vm.focusedNodeId);
  const tokens = themeSwatches(vm.theme);

  if (!node) {
    return (
      <article
        data-block-id={id}
        data-block-type="landscape-embed"
        data-display="focus-card"
        data-theme={vm.theme}
        className={outerClass(embedded, vm.theme)}
      >
        <header
          className="flex items-baseline justify-between gap-2 border-b px-3 py-2 text-[11px] uppercase tracking-widest"
          style={{ borderColor: tokens.rule, color: tokens.inkDim }}
        >
          <span>Focused · Atlas landscape</span>
          {vm.queryA ? (
            <span style={{ color: tokens.queryA }}>A · {vm.queryA}</span>
          ) : null}
        </header>
        <div className="p-4 text-sm" style={{ color: tokens.inkDim }}>
          Node no longer in landscape. The referenced project has been archived
          or renamed since this brief was authored.
        </div>
      </article>
    );
  }

  const isLive = node.type === "live_call";
  const scorePercent = scorePct(node);
  const queryPercent = Math.round(
    similarityAgainstQuery(vm.queryA, node) * 100,
  );
  const neighbourIds = findNeighbourIds(node.id);
  const neighbours = neighbourIds
    .map((nid) => lookupNode(nid))
    .filter((n): n is LandscapeNode => !!n);

  return (
    <article
      data-block-id={id}
      data-block-type="landscape-embed"
      data-display="focus-card"
      data-theme={vm.theme}
      className={outerClass(embedded, vm.theme)}
      style={{ background: tokens.bg1, color: tokens.ink }}
      aria-label={`Focused ${isLive ? "live call" : "project"}: ${node.title}`}
    >
      <header
        className="flex items-baseline justify-between gap-2 border-b px-3 py-2 text-[11px] uppercase tracking-widest"
        style={{ borderColor: tokens.rule, color: tokens.inkDim }}
      >
        <span>{isLive ? "Live funding call" : "Project"}</span>
        {vm.queryA ? (
          <span style={{ color: tokens.queryA }}>
            A ·{" "}
            {vm.queryA.length > 36 ? vm.queryA.slice(0, 34) + "…" : vm.queryA}
          </span>
        ) : null}
      </header>
      <div className="p-4">
        <h3
          className="mb-3 font-['Fraunces',serif] text-[20px] leading-snug italic"
          style={{ color: tokens.ink }}
        >
          {node.title}
        </h3>
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]"
          style={{ color: tokens.inkDim }}
        >
          <dt>Funder</dt>
          <dd style={{ color: tokens.ink }}>
            {node.type === "project"
              ? (node.lead_funder ?? "—")
              : ((node as LandscapeNode & { funder?: string }).funder ?? "—")}
          </dd>
          {node.type === "live_call" && node.deadline ? (
            <>
              <dt>Deadline</dt>
              <dd style={{ color: tokens.ink }}>{node.deadline}</dd>
            </>
          ) : null}
          {node.type === "project" ? (
            <>
              <dt>Relevance</dt>
              <dd style={{ color: tokens.ink }}>{scorePercent}%</dd>
            </>
          ) : null}
        </dl>

        {vm.queryA ? (
          <div className="mt-3">
            <div
              className="mb-1 text-[10px] uppercase tracking-widest"
              style={{ color: tokens.inkDim }}
            >
              Query A · {queryPercent}%
            </div>
            <div
              aria-hidden
              className="h-1.5 w-full overflow-hidden rounded-sm"
              style={{ background: tokens.rule }}
            >
              <div
                style={{
                  width: `${queryPercent}%`,
                  background: tokens.queryA,
                  height: "100%",
                }}
              />
            </div>
          </div>
        ) : null}

        {scorePercent > 0 ? (
          <div className="mt-3">
            <div
              className="mb-1 text-[10px] uppercase tracking-widest"
              style={{ color: tokens.inkDim }}
            >
              Score
            </div>
            <div
              aria-hidden
              className="h-1.5 w-full overflow-hidden rounded-sm"
              style={{ background: tokens.rule }}
            >
              <div
                style={{
                  width: `${scorePercent}%`,
                  background: tokens.project,
                  height: "100%",
                }}
              />
            </div>
          </div>
        ) : null}

        {neighbours.length > 0 ? (
          <div className="mt-4">
            <div
              className="mb-1 text-[10px] uppercase tracking-widest"
              style={{ color: tokens.inkDim }}
            >
              1-hop neighbours
            </div>
            <ul className="flex flex-col gap-0.5 text-[12px]">
              {neighbours.map((nn) => (
                <li key={nn.id}>
                  <a
                    href={`#lens-focus=${encodeURIComponent(nn.id)}`}
                    data-node-id={nn.id}
                    className="hover:underline"
                    style={{ color: tokens.ink }}
                  >
                    ↳{" "}
                    {nn.title.length > 56
                      ? nn.title.slice(0, 54) + "…"
                      : nn.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {vm.caption ? (
          <p
            className="mt-4 text-[12px] leading-relaxed"
            style={{ color: tokens.inkDim }}
          >
            {vm.caption}
          </p>
        ) : null}
      </div>
      <FreshnessLine theme={vm.theme} />
    </article>
  );
}

function FreshnessLine({ theme }: { theme: LandscapeEmbedViewModel["theme"] }) {
  const total = LANDSCAPE_SNAPSHOT.nodes.length;
  const projects = LANDSCAPE_SNAPSHOT.nodes.filter(
    (n) => n.type === "project",
  ).length;
  const liveCalls = total - projects;
  const t = themeSwatches(theme);
  return (
    <footer
      className="border-t px-3 py-1.5 text-[10px]"
      style={{ borderColor: t.rule, color: t.inkDim }}
    >
      Landscape as of {LANDSCAPE_SNAPSHOT.generatedAt.slice(0, 10)} · {projects}{" "}
      projects · {liveCalls} live calls
    </footer>
  );
}

function outerClass(embedded: boolean, theme: string): string {
  return [
    embedded ? "" : "overflow-hidden rounded-md border",
    "border",
    theme === "print" ? "shadow-none" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function themeSwatches(theme: LandscapeEmbedViewModel["theme"]) {
  // Duplicated lightweight token map — we keep this in the server
  // module to avoid pulling the client-side `theme-tokens.ts` (and
  // its THREE.Color helpers) into the share-scope bundle.
  if (theme === "dark") {
    return {
      bg0: "#0a0e13",
      bg1: "#101620",
      ink: "#e8ecf1",
      inkDim: "#8a96a8",
      rule: "#253040",
      project: "#8fe4b1",
      queryA: "#8fe4b1",
      queryB: "#b69afc",
    };
  }
  if (theme === "print") {
    return {
      bg0: "#ffffff",
      bg1: "#ffffff",
      ink: "#000000",
      inkDim: "#333333",
      rule: "#bbbbbb",
      project: "#1f6b47",
      queryA: "#1f6b47",
      queryB: "#4a3099",
    };
  }
  return {
    bg0: "#f7f8f9",
    bg1: "#ffffff",
    ink: "#1a2230",
    inkDim: "#4a5566",
    rule: "#d4d8de",
    project: "#2d9163",
    queryA: "#2d9163",
    queryB: "#6a4bcf",
  };
}

export function landscapeFreshnessMeta() {
  const total = LANDSCAPE_SNAPSHOT.nodes.length;
  const projects = LANDSCAPE_SNAPSHOT.nodes.filter(
    (n) => n.type === "project",
  ).length;
  return {
    generatedAt: LANDSCAPE_SNAPSHOT.generatedAt,
    total,
    projects,
    liveCalls: total - projects,
  };
}
