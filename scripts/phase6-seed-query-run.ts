#!/usr/bin/env tsx
import "load-env";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  pgKnowledgeRepository,
  searchKnowledgeChunks,
} from "@/lib/db/pg/repositories/knowledge-repository.pg";
import { writeFileSync } from "node:fs";

const systemScope = { kind: "system" } as const;

const SEED_QUERIES = [
  "How should we think about portable assurance for funding evidence?",
  "What's happening in maritime decarbonisation funding?",
  "How do we make innovation evidence travel between projects?",
  "What does the strategic business plan say about decarbonisation?",
  "Frame our Atlas funding intelligence work in terms of Justin's architectural pattern",
  "What rail innovation funding closes in Q1?",
  "Connect the testbed model to current transport innovation programmes",
] as const;
const CROSS_CUTTING_MODES = ["rail", "aviation", "maritime", "hit"] as const;

const modeLexicon = {
  rail: /\brail|cp7|network rail|orr\b/i,
  aviation: /\baviation|airport|jet zero|saf|caa|flight|aam|evtol\b/i,
  maritime: /\bmaritime\b|\bports?\b|shipping|vessel|mca|harbour/i,
  hit: /\bhighways?|integrated transport|ris3|road|vehicles?|self-driving|automated vehicles?\b/i,
  data_digital:
    /\bdata\b|\bdigital\b|\btestbed britain\b|\binnovation passport(s)?\b|\bjustin anderson\b|\bportable trust\b|\binteroperab/i,
} as const;

const themeLexicon = {
  autonomy: /\bautonom|automation|driverless|self-driving|drone|cav\b/i,
  decarbonisation: /\bdecarbon|net zero|hydrogen|saf|electrification|emission/i,
  people_experience: /\bpassenger|accessib|inclusion|safety|customer|people\b/i,
  hubs_clusters: /\bhub|cluster|intermodal|place|placemaking|region\b/i,
  planning_operation:
    /\bplanning|operations?|delivery plan|system integration|resilience\b/i,
  industry: /\bindustry|supply chain|commercial|market|investment|funding\b/i,
  data_infrastructure: /\bdata infrastructure|data layer|data platform\b/i,
  assurance_trust:
    /\bassurance|trust|portable trust|conformance|verification|provenance\b/i,
  interoperability:
    /\binteroperab|standards?|exchange|semantic|schema|federat/i,
  testbeds_innovation:
    /\btestbed|pilot|demonstrat|trial|sandbox|innovation passport/i,
  governance_stewardship:
    /\bgovernance|stewardship|policy boundary|sovereign|accountability\b/i,
} as const;

function inferModes(query: string): {
  modes: string[];
  fallbackApplied: boolean;
  fallbackReason: "cross_cutting_phrase" | "generic_innovation";
} {
  const lower = query.toLowerCase();
  const modes = Object.entries(modeLexicon)
    .filter(([, rx]) => rx.test(query))
    .map(([k]) => k);
  if (modes.length > 0) {
    return {
      modes,
      fallbackApplied: false,
      fallbackReason: "cross_cutting_phrase",
    };
  }
  if (
    /\btransport policy\b|\btransport innovation\b|\bacross modes\b/i.test(
      lower,
    )
  ) {
    return {
      modes: [...CROSS_CUTTING_MODES],
      fallbackApplied: true,
      fallbackReason: "cross_cutting_phrase",
    };
  }
  if (/\bevidence\b|\binnovation\b|\bscaling\b/i.test(lower)) {
    return {
      modes: [...CROSS_CUTTING_MODES],
      fallbackApplied: true,
      fallbackReason: "generic_innovation",
    };
  }
  return {
    modes: [...CROSS_CUTTING_MODES],
    fallbackApplied: true,
    fallbackReason: "cross_cutting_phrase",
  };
}
function inferThemes(query: string): string[] {
  return Object.entries(themeLexicon)
    .filter(([, rx]) => rx.test(query))
    .map(([k]) => k);
}
function bridgedModesFromInferred(modes: string[]): string[] {
  if (modes.includes("data_digital")) return [...new Set(modes)];
  return modes.length > 0 ? [...new Set([...modes, "data_digital"])] : [];
}

type Chunk = Awaited<ReturnType<typeof searchKnowledgeChunks>>[number] & {
  rawRank: number;
};
function capChunks(chunks: Chunk[], capPerDoc: number | null): Chunk[] {
  if (!capPerDoc) return chunks.slice(0, 6);
  const out: Chunk[] = [];
  const byDoc = new Map<string, number>();
  for (const c of chunks) {
    if (out.length >= 6) break;
    const n = byDoc.get(c.documentId) ?? 0;
    if (n < capPerDoc) {
      out.push(c);
      byDoc.set(c.documentId, n + 1);
    }
  }
  return out;
}

async function runOne(query: string, cap: number | null) {
  const docs = await pgKnowledgeRepository.listDocuments({}, systemScope);
  const meta = new Map(docs.map((d) => [d.id, d]));
  const inferred = inferModes(query);
  const inferredModes = inferred.modes;
  const inferredThemes = inferThemes(query);
  const bridgedModes = bridgedModesFromInferred(inferredModes);
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: query,
  });
  const embeddingLiteral = `[${embedding.join(",")}]`;

  const [s1, s2, s3, s4, s5] = await Promise.all([
    searchKnowledgeChunks({
      embeddingLiteral,
      modes: inferredModes.length ? inferredModes : undefined,
      topK: 20,
    }),
    searchKnowledgeChunks({
      embeddingLiteral,
      modes: bridgedModes.length ? bridgedModes : undefined,
      topK: 20,
    }),
    searchKnowledgeChunks({ embeddingLiteral, topK: 20 }),
    searchKnowledgeChunks({
      embeddingLiteral,
      modes: ["data_digital"],
      topK: 20,
    }),
    searchKnowledgeChunks({
      embeddingLiteral,
      modes: inferredModes.length ? inferredModes : undefined,
      themes: inferredThemes.length ? inferredThemes : undefined,
      topK: 20,
    }),
  ]);
  const strategies = [s1, s2, s3, s4, s5].map((arr) =>
    capChunks(
      arr.map((c, i) => ({ ...c, rawRank: i + 1 })),
      cap,
    ),
  );

  return {
    strategy3RawCandidates: s3.length,
    inferredModes,
    inferenceFallback: inferred,
    inferredThemes,
    strategies: strategies.map((rows) =>
      rows.map((r) => ({
        title: r.title,
        rawRank: r.rawRank,
        similarity: r.similarity,
        modes: (meta.get(r.documentId)?.modes as string[]) ?? [],
      })),
    ),
  };
}

async function main() {
  const lines: string[] = [];
  lines.push("# Phase 6 Seed Query Run");
  for (const cap of [2, null] as const) {
    lines.push("");
    lines.push(`## Cap = ${cap === null ? "None" : cap}`);
    for (let i = 0; i < SEED_QUERIES.length; i++) {
      const q = SEED_QUERIES[i];
      const out = await runOne(q, cap);
      lines.push("");
      lines.push(`### Q${i + 1}: ${q}`);
      lines.push(
        `Inferred modes: ${out.inferredModes.join(", ") || "(none)"} · themes: ${out.inferredThemes.join(", ") || "(none)"} · strategy3RawCandidates=${out.strategy3RawCandidates} · fallback=${out.inferenceFallback.fallbackApplied ? out.inferenceFallback.fallbackReason : "none"}`,
      );
      out.strategies.forEach((rows, idx) => {
        lines.push(
          `- S${idx + 1}: ${rows.map((r) => `${r.title} (r${r.rawRank}, ${r.similarity.toFixed(3)})`).join(" | ") || "(none)"}`,
        );
      });
    }
  }
  const outPath = "reports/phase6-seed-query-run.md";
  writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${outPath}`);

  const verificationFailures: string[] = [];
  for (const q of SEED_QUERIES) {
    const out = await runOne(q, 2);
    if (out.strategy3RawCandidates <= 0) {
      verificationFailures.push(`Strategy3 rawCandidates=0 for query: ${q}`);
    }
    if (out.inferredModes.length === 0) {
      verificationFailures.push(`Empty inferredModes for query: ${q}`);
    }
  }
  if (verificationFailures.length > 0) {
    throw new Error(`Verification failed:\n${verificationFailures.join("\n")}`);
  }
  console.log(
    "Verification passed: strategy3 non-zero and inferredModes non-empty for all 7 queries.",
  );
}

void main();
