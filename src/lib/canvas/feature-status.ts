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

export type FeatureStatus = "ready" | "wip" | "planned";

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

  // --- Canvas stage-mounts (Thread 2 of the roadmap) -----------------------
  {
    id: "stage.chart",
    label: "Full-size chart in stage",
    status: "planned",
    surface: "canvas",
    promptNote:
      "Charts render as chat-rail cards today (pie / bar / line / table) but cannot yet fill the canvas stage. Emit a chat-rail card instead.",
  },
  {
    id: "stage.passport",
    label: "Full-size passport in stage",
    status: "planned",
    surface: "canvas",
    promptNote:
      "Passport detail cannot yet render in the canvas stage. Use the passport tool-invocation cards in the chat rail instead.",
  },
  {
    id: "stage.table",
    label: "Full-size table in stage",
    status: "planned",
    surface: "canvas",
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
    status: "wip",
    surface: "voice",
    note: "Floating mic lands in Sprint A §3 — Realtime backend already working",
    promptNote:
      "On /canvas, the floating bottom-centre mic button is visible but not yet wired. Voice still works via the header mic — point users there if they ask.",
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
      "The briefing panel is a planned UI — do not attempt to create, edit, or reference briefing blocks.",
  },
];

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  ready: "Ready",
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
  const wip = grouped.wip.map(line).join("\n");
  const planned = grouped.planned.map(line).join("\n");

  return `### Canvas capabilities (truthful snapshot)
READY:
${ready}

IN PROGRESS:
${wip}

PLANNED:
${planned}

Rule: If the user asks for a WIP or PLANNED feature, say in one sentence that it is in progress and offer the closest READY alternative from this list. Do not attempt to simulate or fake the feature.`;
}
