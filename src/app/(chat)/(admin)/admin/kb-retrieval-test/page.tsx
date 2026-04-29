"use client";

import { useState } from "react";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";
import { Checkbox } from "ui/checkbox";

type Agent = "atlas" | "jarvis";
type CapOption = "none" | "1" | "2" | "3" | "5";

type Chunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentModes: string[];
  documentThemes: string[];
  chunkText: string;
  similarity: number;
  rawRank: number;
  promotedByCap: boolean;
};

type StrategyResult = {
  filter: { modes?: string[]; themes?: string[] };
  rawCandidates: number;
  chunks: Chunk[];
  durationMs: number;
};

type ApiResponse = {
  query: string;
  inferredModes: string[];
  inferredThemes: string[];
  inferenceDebug?: {
    fallbackApplied: boolean;
    fallbackReason: "cross_cutting_phrase" | "generic_innovation";
  };
  capPerDoc: number | null;
  strategies: {
    strategy1_strict: StrategyResult;
    strategy2_bridged: StrategyResult;
    strategy3_pure: StrategyResult;
    strategy4_dd_only: StrategyResult;
    strategy5_mode_theme: StrategyResult;
  };
  totalDurationMs: number;
};

const SEED_QUERIES = [
  "How should we think about portable assurance for funding evidence?",
  "What's happening in maritime decarbonisation funding?",
  "How do we make innovation evidence travel between projects?",
  "What does the strategic business plan say about decarbonisation?",
  "Frame our Atlas funding intelligence work in terms of Justin's architectural pattern",
  "What rail innovation funding closes in Q1?",
  "Connect the testbed model to current transport innovation programmes",
] as const;

const STRATEGY_META: Array<{
  key: keyof ApiResponse["strategies"];
  title: string;
}> = [
  { key: "strategy1_strict", title: "Strategy 1: Strict Mode Filter" },
  { key: "strategy2_bridged", title: "Strategy 2: Bridged (Mode + D&D)" },
  { key: "strategy3_pure", title: "Strategy 3: Pure Semantic (No Filter)" },
  { key: "strategy4_dd_only", title: "Strategy 4: Data & Digital Only" },
  { key: "strategy5_mode_theme", title: "Strategy 5: Mode + Theme" },
];

function displayCap(cap: CapOption): number | null {
  if (cap === "none") return null;
  return Number(cap);
}

function fmtList(items: string[] | undefined): string {
  if (!items || items.length === 0) return "(none)";
  return items.join(", ");
}

export default function KbRetrievalTestPage() {
  const [agent, setAgent] = useState<Agent>("atlas");
  const [query, setQuery] = useState<string>(SEED_QUERIES[0]);
  const [capOption, setCapOption] = useState<CapOption>("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [helpful, setHelpful] = useState<Record<string, boolean>>({});

  async function run(currentQuery?: string, currentCap?: CapOption) {
    const q = (currentQuery ?? query).trim();
    const cap = displayCap(currentCap ?? capOption);
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/kb-retrieval-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          agent,
          capPerDoc: cap,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.detail || json?.error || "Request failed");
      }
      setData(json as ApiResponse);
      setHelpful({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative bg-background w-full flex flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="space-y-4 w-full max-w-7xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                KB Retrieval Test Harness
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-center">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask a policy / strategy / doctrine retrieval question..."
                />
                <Button onClick={() => run()} disabled={loading}>
                  {loading ? "Running..." : "Run"}
                </Button>
                <div className="flex gap-1">
                  <Button
                    variant={agent === "atlas" ? "default" : "outline"}
                    onClick={() => setAgent("atlas")}
                  >
                    ATLAS
                  </Button>
                  <Button
                    variant={agent === "jarvis" ? "default" : "outline"}
                    onClick={() => setAgent("jarvis")}
                  >
                    JARVIS
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {SEED_QUERIES.map((q, i) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery(q);
                      run(q);
                    }}
                  >
                    Q{i + 1}
                  </Button>
                ))}
              </div>

              <div className="text-sm text-muted-foreground">
                <p>
                  Inferred modes:{" "}
                  <span className="text-foreground">
                    {fmtList(data?.inferredModes)}
                  </span>
                </p>
                <p>
                  Inferred themes:{" "}
                  <span className="text-foreground">
                    {fmtList(data?.inferredThemes)}
                  </span>
                </p>
                {data?.inferenceDebug && (
                  <p>
                    Inference fallback:{" "}
                    <span className="text-foreground">
                      {data.inferenceDebug.fallbackApplied
                        ? `yes (${data.inferenceDebug.fallbackReason})`
                        : "no"}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border rounded-md p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Per-document cap</p>
                  <p className="text-xs text-muted-foreground">
                    Limits chunks-per-document in final top-6 (post-retrieval).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(["none", "1", "2", "3", "5"] as const).map((cap) => (
                    <Button
                      key={cap}
                      variant={capOption === cap ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setCapOption(cap);
                        // Re-run for simpler state model (documented).
                        run(undefined, cap);
                      }}
                    >
                      {cap === "none" ? "None" : cap}
                    </Button>
                  ))}
                  <span className="text-xs text-muted-foreground ml-2">
                    Top-K: 6 (raw pool 20)
                  </span>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>

          {data && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Total duration: {data.totalDurationMs}ms · Cap:{" "}
                {data.capPerDoc ?? "None"}
              </p>
              {STRATEGY_META.map((meta) => {
                const strat = data.strategies[meta.key];
                const isCollapsed = collapsed[meta.key] ?? false;
                return (
                  <Card key={meta.key}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          {meta.title}
                        </CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCollapsed((prev) => ({
                              ...prev,
                              [meta.key]: !isCollapsed,
                            }))
                          }
                        >
                          {isCollapsed ? "Expand" : "Collapse"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        filters: modes[{fmtList(strat.filter.modes)}] · themes[
                        {fmtList(strat.filter.themes)}] · rawCandidates=
                        {strat.rawCandidates} · duration={strat.durationMs}ms
                      </p>
                    </CardHeader>
                    {!isCollapsed && (
                      <CardContent className="space-y-2">
                        {strat.chunks.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No chunks returned for this strategy.
                          </p>
                        ) : (
                          strat.chunks.map((c) => {
                            const helpfulKey = `${meta.key}:${c.chunkId}`;
                            return (
                              <div
                                key={c.chunkId}
                                className="border rounded-md p-3 space-y-1"
                              >
                                <div className="flex justify-between gap-2">
                                  <p className="text-sm font-medium">
                                    {c.documentTitle}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    sim={c.similarity.toFixed(3)} · rawRank=
                                    {c.rawRank} · promotedByCap=
                                    {String(c.promotedByCap)}
                                  </p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  modes: {fmtList(c.documentModes)} · themes:{" "}
                                  {fmtList(c.documentThemes)}
                                </p>
                                <p className="text-sm whitespace-pre-wrap">
                                  {c.chunkText.slice(0, 320)}
                                  {c.chunkText.length > 320 ? "..." : ""}
                                </p>
                                <label className="text-xs flex items-center gap-2">
                                  <Checkbox
                                    checked={helpful[helpfulKey] ?? false}
                                    onCheckedChange={(checked) =>
                                      setHelpful((prev) => ({
                                        ...prev,
                                        [helpfulKey]: Boolean(checked),
                                      }))
                                    }
                                  />
                                  Helpful?
                                </label>
                              </div>
                            );
                          })
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
