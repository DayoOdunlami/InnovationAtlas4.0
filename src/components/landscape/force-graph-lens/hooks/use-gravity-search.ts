"use client";

// ---------------------------------------------------------------------------
// useGravitySearch — debounced + memoised client for
// POST /api/landscape/gravity-search.
//
// Plan §3: "debounces and caches by query string; a repeat of the same
// query does not re-fetch." Kept dumb — any upstream consumer that
// needs to force a refresh clears its own cache.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import type { SimilarityMap } from "../types";

type GravityRow = {
  id: string;
  similarity: number;
  node_type: string;
};

type GravityResponse = {
  results: GravityRow[];
};

export type GravitySearchState = {
  query: string | null;
  similarity: SimilarityMap | null;
  loading: boolean;
  error: string | null;
};

const DEFAULT_DEBOUNCE_MS = 180;

export function useGravitySearch(
  query: string | null,
  options: { debounceMs?: number } = {},
): GravitySearchState {
  const [state, setState] = useState<GravitySearchState>({
    query: null,
    similarity: null,
    loading: false,
    error: null,
  });
  const cacheRef = useRef<Map<string, SimilarityMap>>(new Map());
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const normalised = useMemo(() => {
    const q = (query ?? "").trim().toLowerCase();
    return q.length > 0 ? q : null;
  }, [query]);

  useEffect(() => {
    if (!normalised) {
      setState({ query: null, similarity: null, loading: false, error: null });
      return;
    }

    const cached = cacheRef.current.get(normalised);
    if (cached) {
      setState({
        query: normalised,
        similarity: cached,
        loading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setState((s) => ({
        ...s,
        loading: true,
        error: null,
        query: normalised,
      }));
      try {
        const res = await fetch("/api/landscape/gravity-search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query }),
        });
        if (!res.ok) {
          const body = (await res
            .json()
            .catch(() => ({ error: res.statusText }))) as {
            error?: string;
          };
          throw new Error(body.error ?? `gravity-search ${res.status}`);
        }
        const body = (await res.json()) as GravityResponse;
        if (cancelled) return;
        const map: SimilarityMap = new Map();
        for (const r of body.results) {
          map.set(
            String(r.id),
            Math.max(0, Math.min(1, Number(r.similarity) || 0)),
          );
        }
        cacheRef.current.set(normalised, map);
        setState({
          query: normalised,
          similarity: map,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          query: normalised,
          similarity: null,
          loading: false,
          error: err instanceof Error ? err.message : "gravity-search failed",
        });
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalised, query, debounceMs]);

  return state;
}

export function clearGravityCache(_cacheKey?: string): void {
  // Reserved for future invalidation tooling (per-cache-key reset). The
  // hook creates a new cache per mount so unmount already clears it.
}
