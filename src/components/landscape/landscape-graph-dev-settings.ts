/**
 * Tunable landscape force-graph parameters for dev / UX experiments.
 * Persisted in sessionStorage (see STORAGE_KEY).
 */

export type LandscapePhysicsMode = "umap" | "hybrid" | "live";

export const LANDSCAPE_GRAPH_DEV_STORAGE_KEY =
  "innovation-atlas.landscape-graph-dev-settings.v1";

export type LandscapeGraphDevSettings = {
  /** Multiply viz_x / viz_y for canvas coordinates */
  umapScale: number;
  lodEnabled: boolean;
  /** Below this globalScale, draw nodes as small dots */
  lodNodeDotBelow: number;
  lodHideLinksBelow: number;
  lodHideDisplayBelow: number;
  /** Above this globalScale, draw short title labels */
  lodLabelAbove: number;
  /** d3 many-body charge (negative = repulsion) */
  chargeStrength: number;
  /** Multiplier inside link distance: `linkDistanceBase * (1 - weight)` */
  linkDistanceBase: number;
  /** Added to node radius in collision force */
  collisionExtra: number;
  /** Cluster centroid pull strength (multiplies alpha in custom force) */
  clusterPull: number;
  warmupTicksUmap: number;
  cooldownTicksUmap: number;
  cooldownTimeUmap: number;
  warmupTicksLive: number;
  /** Use ≥ 1e6 to mean “until time only” (maps to Infinity in ForceGraph). */
  cooldownTicksLive: number;
  cooldownTimeLive: number;
  warmupTicksHybrid: number;
  cooldownTicksHybrid: number;
  cooldownTimeHybrid: number;
  progressiveEdgeDelayMs: number;
  zoomFitDurationMs: number;
  zoomFitPaddingPx: number;
  manualZoomFitPaddingPx: number;
};

export const DEFAULT_LANDSCAPE_GRAPH_DEV_SETTINGS: LandscapeGraphDevSettings = {
  umapScale: 8,
  lodEnabled: true,
  lodNodeDotBelow: 0.45,
  lodHideLinksBelow: 0.22,
  lodHideDisplayBelow: 0.2,
  lodLabelAbove: 2.2,
  chargeStrength: -120,
  linkDistanceBase: 60,
  collisionExtra: 2,
  clusterPull: 0.3,
  warmupTicksUmap: 200,
  cooldownTicksUmap: 0,
  cooldownTimeUmap: 500,
  warmupTicksLive: 0,
  cooldownTicksLive: 9_999_999,
  cooldownTimeLive: 15_000,
  warmupTicksHybrid: 120,
  cooldownTicksHybrid: 0,
  cooldownTimeHybrid: 2800,
  progressiveEdgeDelayMs: 400,
  zoomFitDurationMs: 400,
  zoomFitPaddingPx: 40,
  manualZoomFitPaddingPx: 20,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function loadLandscapeGraphDevSettings(): LandscapeGraphDevSettings {
  if (typeof window === "undefined")
    return DEFAULT_LANDSCAPE_GRAPH_DEV_SETTINGS;
  try {
    const raw = sessionStorage.getItem(LANDSCAPE_GRAPH_DEV_STORAGE_KEY);
    if (!raw) return DEFAULT_LANDSCAPE_GRAPH_DEV_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_LANDSCAPE_GRAPH_DEV_SETTINGS;
    return {
      ...DEFAULT_LANDSCAPE_GRAPH_DEV_SETTINGS,
      ...parsed,
    } as LandscapeGraphDevSettings;
  } catch {
    return DEFAULT_LANDSCAPE_GRAPH_DEV_SETTINGS;
  }
}

export function saveLandscapeGraphDevSettings(
  s: LandscapeGraphDevSettings,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LANDSCAPE_GRAPH_DEV_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota
  }
}
