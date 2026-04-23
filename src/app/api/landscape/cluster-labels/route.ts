// ---------------------------------------------------------------------------
// POST /api/landscape/cluster-labels — Phase 3b.
//
// Given the cluster assignments for a landscape snapshot, produce a
// short human-readable label per cluster. Labels are generated once
// per snapshot hash and cached in-memory on the server process; the
// client passes the snapshot hash alongside the centroid-of-cluster
// tag hints the adapter computed.
//
// In the POC the labels are hard-coded (`CLUSTERS` array); here they
// come from a single LLM call whose JSON response is parsed and
// validated. If the LLM is unreachable we fall back to the sample-title-
// derived label the client computed locally — the lens therefore always
// renders something meaningful.
//
// Phase 3b execution prompt: "Cluster labels → HDBSCAN/k-means on UMAP-
// pinned coords → one LLM call per cluster for the display label,
// cached keyed on the snapshot hash."
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import { customModelProvider } from "@/lib/ai/models";
import { getSession } from "lib/auth/server";

const RequestSchema = z.object({
  snapshotHash: z.string().min(1).max(128),
  clusters: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        sampleTitles: z.array(z.string().max(240)).max(10),
      }),
    )
    .min(1)
    .max(32),
});

type CacheEntry = {
  labels: Record<number, string>;
  at: number;
};

// Process-local label cache. `globalThis` survives Next.js HMR in dev so
// we don't hammer the LLM every reload. TTL is 24h; regenerating is
// cheap once a new snapshot hash lands.
const CACHE_KEY = "__atlas_cluster_label_cache__";
type GlobalWithCache = typeof globalThis & {
  [CACHE_KEY]?: Map<string, CacheEntry>;
};
const g = globalThis as GlobalWithCache;
if (!g[CACHE_KEY]) g[CACHE_KEY] = new Map();
const CACHE: Map<string, CacheEntry> = g[CACHE_KEY]!;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function fallbackLabel(titles: string[]): string {
  // Pick the shortest substantive title as a hint and strip trailing
  // fluff — deterministic so tests don't need the LLM.
  if (titles.length === 0) return "Cluster";
  const t = [...titles].sort((a, b) => a.length - b.length)[0];
  const cleaned = t.replace(/\s+/g, " ").trim().slice(0, 32);
  return cleaned || "Cluster";
}

function parseLLMResponse(raw: string): Record<number, string> | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    const json = raw.slice(start, end + 1);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k);
      if (!Number.isFinite(id) || typeof v !== "string") continue;
      out[id] = v.slice(0, 48);
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const cached = CACHE.get(body.snapshotHash);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ labels: cached.labels, cached: true });
  }

  const fallback: Record<number, string> = {};
  for (const c of body.clusters) fallback[c.id] = fallbackLabel(c.sampleTitles);

  try {
    const prompt =
      "You are labelling clusters of UK transport innovation projects by theme. For each cluster below, emit a SHORT (2–4 word) human-readable display label, e.g. 'Rail · Hydrogen', 'Maritime · Autonomy', 'Aviation · SAF'. Return ONLY a JSON object mapping cluster id → label. No prose, no code fences.\n\n" +
      body.clusters
        .map(
          (c) =>
            `Cluster ${c.id} — sample titles:\n  - ${c.sampleTitles.slice(0, 6).join("\n  - ")}`,
        )
        .join("\n\n");

    const { text } = await generateText({
      model: customModelProvider.getModel(),
      system:
        "You are a terse labelling engine. Output strictly a single-line JSON object of { clusterId: label }.",
      prompt,
    });
    const parsed = parseLLMResponse(text);
    const labels = { ...fallback, ...(parsed ?? {}) };
    CACHE.set(body.snapshotHash, { labels, at: Date.now() });
    return NextResponse.json({ labels, cached: false, llm: Boolean(parsed) });
  } catch {
    CACHE.set(body.snapshotHash, { labels: fallback, at: Date.now() });
    return NextResponse.json({ labels: fallback, cached: false, llm: false });
  }
}
