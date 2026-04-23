"use client";

// ---------------------------------------------------------------------------
// useLandscapeData — fetches the real landscape payload once per mount.
//
// Phase 3b execution prompt line 28-31: "Do NOT ship synthetic data.
// Node/link payload → /api/landscape/data (already exists, returns real
// projects)."
//
// The in-page snapshot at `src/lib/landscape/snapshot.ts` is used as the
// **compile-time fallback** for SSR / playground / tests, not as the
// runtime source. Runtime always prefers the live API so edits to the
// corpus are picked up without a rebuild.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import type { LandscapeData as LegacyLandscapeGraph } from "@/lib/landscape/types";
import type { LandscapeData as ApiLandscapeData } from "@/app/api/landscape/data/route";
import { LANDSCAPE_SNAPSHOT } from "@/lib/landscape/snapshot";

type State = {
  data: LegacyLandscapeGraph | null;
  loading: boolean;
  error: string | null;
};

const SNAPSHOT_FALLBACK: LegacyLandscapeGraph = LANDSCAPE_SNAPSHOT;

/**
 * Convert the `/api/landscape/data` response (separate projects /
 * liveCalls / organisations lists) into the LandscapeData graph shape
 * expected by the lens adapter. Links don't exist in that route, so
 * the fallback snapshot's links are used instead — this keeps the
 * existing per-project edges intact until the edges API lands.
 */
function apiToGraph(api: ApiLandscapeData): LegacyLandscapeGraph {
  const projects = api.projects.map((p) => ({
    id: p.id,
    type: "project" as const,
    title: p.title,
    lead_funder: p.lead_funder ?? undefined,
    score:
      p.transport_relevance_score != null
        ? Math.round(Number(p.transport_relevance_score) * 1000) / 1000
        : undefined,
    x: Number(p.viz_x),
    y: Number(p.viz_y),
  }));
  const liveCalls = api.liveCalls.map((c) => ({
    id: c.id,
    type: "live_call" as const,
    title: c.title,
    funder: c.funder ?? undefined,
    deadline: c.deadline ?? null,
    status: c.status ?? undefined,
    x: Number(c.viz_x),
    y: Number(c.viz_y),
  }));
  // The snapshot is the source of truth for edges until /api/landscape
  // /data also returns them — map only the ids we know are present.
  const ids = new Set<string>([
    ...projects.map((p) => p.id),
    ...liveCalls.map((c) => c.id),
  ]);
  const links = SNAPSHOT_FALLBACK.links.filter(
    (l) => ids.has(l.source_id) && ids.has(l.target_id),
  );
  return {
    generatedAt: new Date().toISOString(),
    nodes: [...projects, ...liveCalls],
    links,
  };
}

export function useLandscapeData(): State {
  const [state, setState] = useState<State>({
    data: SNAPSHOT_FALLBACK,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/landscape/data", {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`landscape/data ${res.status}`);
        }
        const body = (await res.json()) as ApiLandscapeData;
        if (cancelled) return;
        const graph = apiToGraph(body);
        // If the API returns zero projects fall back silently to the
        // in-bundle snapshot so the lens still renders on empty DBs.
        setState({
          data: graph.nodes.length > 0 ? graph : SNAPSHOT_FALLBACK,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          data: SNAPSHOT_FALLBACK,
          loading: false,
          error: err instanceof Error ? err.message : "landscape-data failed",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = useMemo(() => state.data, [state.data]);
  return { data, loading: state.loading, error: state.error };
}
