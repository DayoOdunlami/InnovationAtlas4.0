// ---------------------------------------------------------------------------
// Feature status registry (Thread 1 — canvas status + AI context)
//
// Single source of truth for what is demo-ready, work-in-progress, and planned
// across the Innovation Atlas surfaces. Both the in-product status popover
// (`CanvasStatusPopover`) and the LLM system prompt
// (`buildCanvasContextSystemPrompt`) read from this file. UI and AI therefore
// cannot drift — update this list and the chip, popover, and agent all change
// together. Operational roadmap commentary lives in
// `docs/canvas-status-and-roadmap.md`.
// ---------------------------------------------------------------------------

// `alpha` was added in Phase 1 (Brief-First Rebuild) for routes that are
// live behind a stable URL but still pre-beta. It sits between `wip` and
// `ready` — the route renders, but the UX is intentionally minimal and
// behaviour may change between phases.
export type FeatureStatus = "ready" | "alpha" | "wip" | "planned";

export type FeatureSurface =
  | "canvas"
  | "landscape"
  | "passport"
  | "voice"
  | "tool"
  | "briefing";

export type FeatureEntry = {
  /** Dotted id, stable across releases. Used by tests + as React key. */
  id: string;
  /** Human-readable label shown in the popover. */
  label: string;
  status: FeatureStatus;
  surface: FeatureSurface;
  /** One-line UI note shown beneath the label. Keep < 80 chars. */
  note?: string;
  /** Longer guidance injected into the LLM capabilities block. */
  promptNote?: string;
};

export const FEATURE_STATUS: ReadonlyArray<FeatureEntry> = [
  // --- Canvas lenses --------------------------------------------------------
  {
    id: "lens.force-graph",
    label: "Force-graph lens",
    status: "wip",
    surface: "canvas",
    note: "v1 demo-ready; gravity mode being rebuilt",
    promptNote:
      "The force-graph lens renders but the gravity/search-driven orbit mode is being rebuilt. Do not promise new gravity behaviours this session.",
  },
  {
    id: "lens.scatter",
    label: "Scatter lens",
    status: "planned",
    surface: "canvas",
  },
  {
    id: "lens.sankey",
    label: "Sankey lens",
    status: "planned",
    surface: "canvas",
  },
  {
    id: "lens.timeline",
    label: "Timeline lens",
    status: "planned",
    surface: "canvas",
  },
  {
    id: "lens.coverage",
    label: "Coverage matrix",
    status: "planned",
    surface: "canvas",
  },

  // --- Canvas stage-mounts (Thread 2 landed) -------------------------------
  {
    id: "stage.chart",
    label: "Full-size chart in stage",
    status: "ready",
    surface: "canvas",
    note: "mountChartInStage — bar / line / pie",
    promptNote:
      "Call `mountChartInStage` to dominate the canvas main stage with a full-size chart. Use the inline `createBarChart` / `createLineChart` / `createPieChart` when the user only wants a chat-rail card.",
  },
  {
    id: "stage.passport",
    label: "Full-size passport in stage",
    status: "ready",
    surface: "canvas",
    note: "mountPassportInStage — header, documents, claims",
    promptNote:
      "Call `mountPassportInStage` with a passport UUID to render the full passport (header + documents + claims) in the canvas stage. Prefer this to linking to /passport/[id] when the conversation is on /canvas.",
  },
  {
    id: "stage.table",
    label: "Full-size table in stage",
    status: "ready",
    surface: "canvas",
    note: "mountTableInStage — search, sort, CSV/Excel export",
    promptNote:
      "Call `mountTableInStage` for wide result sets (projects, organisations, claims, partner shortlists) so the table fills the stage with search / sort / export. Use inline `createTable` for small tables that fit the chat rail.",
  },

  // --- Passport flow (end-to-end live) --------------------------------------
  {
    id: "passport.list",
    label: "List passports",
    status: "ready",
    surface: "passport",
  },
  {
    id: "passport.claims",
    label: "Claim extraction",
    status: "ready",
    surface: "passport",
  },
  {
    id: "passport.match",
    label: "Run matching",
    status: "ready",
    surface: "passport",
  },
  {
    id: "passport.gap",
    label: "Gap analysis",
    status: "ready",
    surface: "passport",
  },
  {
    id: "passport.pitch",
    label: "Draft pitch",
    status: "ready",
    surface: "passport",
  },
  {
    id: "passport.partners",
    label: "Consortium partners",
    status: "ready",
    surface: "passport",
  },

  // --- Chat-rail visualisation cards ----------------------------------------
  { id: "viz.pie", label: "Pie chart", status: "ready", surface: "tool" },
  { id: "viz.bar", label: "Bar chart", status: "ready", surface: "tool" },
  { id: "viz.line", label: "Line chart", status: "ready", surface: "tool" },
  {
    id: "viz.table",
    label: "Interactive table",
    status: "ready",
    surface: "tool",
  },

  // --- Voice ----------------------------------------------------------------
  {
    id: "voice.realtime",
    label: "Voice chat (Realtime)",
    status: "ready",
    surface: "voice",
    note: "Header + prompt mic, JARVIS + MCP, slices A–C live",
  },
  {
    id: "voice.canvas",
    label: "Voice on /canvas",
    status: "ready",
    surface: "voice",
    note: "Floating mic opens the Realtime voice drawer, same session as the header mic",
    promptNote:
      "The canvas has a floating bottom-centre mic that opens the same Realtime voice session as the header / prompt mic. JARVIS + MCP tool bindings carry over.",
  },

  // --- Landscape routes -----------------------------------------------------
  {
    id: "route.landscape-3d",
    label: "/landscape-3d",
    status: "wip",
    surface: "landscape",
    note: "Canonical 3D landscape — gravity mode being rebuilt",
  },
  {
    id: "route.landscape-3d.gravity",
    label: "Gravity / keyword orbit",
    status: "wip",
    surface: "landscape",
    note: "Rebuild plan: docs/force-graph-lens-plan.md",
  },
  {
    id: "route.landscape",
    label: "/landscape (legacy)",
    status: "wip",
    surface: "landscape",
    note: "Exploratory variant — superseded by /landscape-3d",
  },
  {
    id: "route.landscape-v2",
    label: "/landscape-v2 (legacy)",
    status: "wip",
    surface: "landscape",
    note: "Exploratory variant — superseded by /landscape-3d",
  },

  // --- Briefing -------------------------------------------------------------
  {
    id: "briefing.blocks",
    label: "Briefing panel",
    status: "planned",
    surface: "briefing",
    promptNote:
      "The briefing panel is a planned UI — do not attempt to create, edit, or reference briefing blocks. Brief blocks land in Phase 2a.0.",
  },

  // --- Brief-first routes (Phase 1 — minimal shell, live behind URL) -------
  {
    id: "route.briefs",
    label: "/briefs (list)",
    status: "alpha",
    surface: "briefing",
    note: "Phase 1 shell — list, create, rename, delete.",
    promptNote:
      "The briefs list lives at /briefs. Users can create, rename and delete their own briefs there; blocks inside a brief arrive in Phase 2a.0.",
  },
  {
    id: "route.brief",
    label: "/brief/[id] (shell)",
    status: "alpha",
    surface: "briefing",
    note: "Phase 1 shell with chat + persisted messages.",
    promptNote:
      "The /brief/[id] page is a minimal shell with a chat rail whose messages persist to atlas.messages. No blocks, no tools, no canvas — those land in Phase 2a.0 and beyond.",
  },
];

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  ready: "Ready",
  alpha: "Alpha",
  wip: "In progress",
  planned: "Planned",
};

export const SURFACE_LABEL: Record<FeatureSurface, string> = {
  canvas: "Canvas",
  landscape: "Landscape",
  passport: "Passport",
  voice: "Voice",
  tool: "Tools",
  briefing: "Briefing",
};

export function groupByStatus(
  entries: ReadonlyArray<FeatureEntry> = FEATURE_STATUS,
): Record<FeatureStatus, FeatureEntry[]> {
  const out: Record<FeatureStatus, FeatureEntry[]> = {
    ready: [],
    alpha: [],
    wip: [],
    planned: [],
  };
  for (const e of entries) out[e.status].push(e);
  return out;
}

export function groupBySurface(
  entries: ReadonlyArray<FeatureEntry> = FEATURE_STATUS,
): Record<FeatureSurface, FeatureEntry[]> {
  const out: Record<FeatureSurface, FeatureEntry[]> = {
    canvas: [],
    landscape: [],
    passport: [],
    voice: [],
    tool: [],
    briefing: [],
  };
  for (const e of entries) out[e.surface].push(e);
  return out;
}

export function hasActiveWipOnCanvas(
  entries: ReadonlyArray<FeatureEntry> = FEATURE_STATUS,
): boolean {
  return entries.some((e) => e.surface === "canvas" && e.status === "wip");
}

/**
 * Terse, bulleted capabilities block for the LLM system prompt. Shape is
 * three short lists (READY / WIP / PLANNED) plus a single behaviour rule.
 * Keep this small — every token costs context window for real work.
 */
export function formatFeatureStatusForPrompt(
  entries: ReadonlyArray<FeatureEntry> = FEATURE_STATUS,
): string {
  const grouped = groupByStatus(entries);
  const line = (e: FeatureEntry): string => {
    const note = e.promptNote ?? e.note;
    return note ? `- ${e.label} — ${note}` : `- ${e.label}`;
  };
  const ready = grouped.ready.map(line).join("\n");
  const alpha = grouped.alpha.map(line).join("\n");
  const wip = grouped.wip.map(line).join("\n");
  const planned = grouped.planned.map(line).join("\n");

  return `### Canvas capabilities (truthful snapshot)
READY:
${ready}

ALPHA:
${alpha}

IN PROGRESS:
${wip}

PLANNED:
${planned}

Rule: If the user asks for a WIP or PLANNED feature, say in one sentence that it is in progress and offer the closest READY alternative from this list. Alpha features are live but minimal; describe their Phase 1 scope if asked and surface the URL. Do not attempt to simulate or fake the feature.`;
}
