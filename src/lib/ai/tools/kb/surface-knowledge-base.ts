// ---------------------------------------------------------------------------
// surfaceKnowledgeBase — Curated Knowledge Base retrieval tool (KB-1)
//
// Retrieves tier-labelled chunks from atlas.knowledge_chunks via cosine
// similarity search. Returns document provenance so the model can cite
// inline: "From the Transport Knowledge Library — [title, publisher, year]."
//
// Tier discipline mirrors HYVE's src/lib/ai/prompts/hyve.ts:
//   Tier 1b — Curated Knowledge Base (between Atlas corpus and OpenAlex)
//
// Over-grounding guards (docs/knowledge-base-plan.md §5.1):
//   * Tool-invoked only — never auto-injected into system prompt.
//   * Capped at 6 chunks (≤ 10 if caller specifies).
//   * Returns { results: [], reason } when top-1 similarity < 0.3.
//   * Every chunk carries provenance; the model MUST cite it.
//
// Phase 7 (demo defaults): retrieval uses shared harness semantics — Strategy 2
// (bridged + data_digital) for ATLAS / default agents, Strategy 5 (mode + theme)
// for JARVIS, then per-document cap=2 and final top 6. On failure, pure semantic
// top-6 (no filters) is the safe fallback.
//
// Scope fence: reads only. Never writes to atlas.knowledge_*.
// ---------------------------------------------------------------------------

import { tool as createTool } from "ai";
import { z } from "zod";
import { searchKnowledgeChunks } from "@/lib/db/pg/repositories/knowledge-repository.pg";
import {
  KB_RETRIEVAL_CAP_PER_DOC,
  KB_RETRIEVAL_FINAL_TOP_K,
  KB_RETRIEVAL_RAW_TOP_K,
  applyDiversityCap,
  buildSearchParamsForBranch,
  inferModesFromQuery,
  inferThemesFromQuery,
  kbRetrievalBranchForAgent,
  type KbRetrievalBranch,
  type KbRetrievalEnrichedChunk,
} from "@/lib/kb/retrieval-strategies";

const CONFIDENCE_THRESHOLD = 0.3;
const DEFAULT_TOP_K = 6;
const MAX_TOP_K = 10;

const KnowledgeModeSchema = z.enum([
  "rail",
  "aviation",
  "maritime",
  "hit",
  "data_digital",
]);

const KnowledgeThemeSchema = z.enum([
  "autonomy",
  "decarbonisation",
  "people_experience",
  "hubs_clusters",
  "planning_operation",
  "industry",
  "data_infrastructure",
  "assurance_trust",
  "interoperability",
  "testbeds_innovation",
  "governance_stewardship",
]);

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Natural-language question to search in the curated knowledge base (policy docs, strategy papers, government reports, regulator publications).",
    ),
  modes: z
    .array(KnowledgeModeSchema)
    .optional()
    .describe(
      "Restrict to documents tagged for these transport modes. Leave empty for cross-mode queries.",
    ),
  themes: z
    .array(KnowledgeThemeSchema)
    .optional()
    .describe(
      "Restrict to documents tagged with these strategic themes. Leave empty for broad queries.",
    ),
  topK: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_K)
    .optional()
    .default(DEFAULT_TOP_K)
    .describe(
      `Number of chunks to return (default ${DEFAULT_TOP_K}, max ${MAX_TOP_K}).`,
    ),
});

export type SurfaceKnowledgeBaseInput = z.infer<typeof inputSchema>;

export const SURFACE_KNOWLEDGE_BASE_TOOL_DESCRIPTION = [
  "Use for curated KB questions about UK transport strategy and policy across rail, aviation, maritime, and highways; cross-cutting transport policy; and Connected Places Catapult Data & Digital architectural doctrine.",
  'The KB includes named CPC doctrine documents such as "Testbed Britain" (Justin Anderson) and "Innovation Passports", plus transport strategy sources like DfT plans, ORR reports, Network Rail and industry strategy papers.',
  "Prefer this tool BEFORE web search when the user asks about CPC strategy, UK transport policy, transport innovation funding context, named CPC documents, or named CPC people (for example Justin Anderson).",
  "Do NOT use this tool for corpus project counts/lists (use supabase-atlas), peer-reviewed literature synthesis (use surfaceResearch), or live breaking updates/funding calls/news (use web search fallback if KB is thin).",
  "Returns tier-labelled chunks with provenance. ALWAYS cite title, publisher, and year inline. If coverage is thin, say so and then fall back to Atlas corpus or web search.",
].join(" ");

export interface KnowledgeChunkResult {
  chunkIndex: number;
  body: string;
  similarity: number;
  tokenCount: number;
}

export interface KnowledgeDocumentResult {
  documentId: string;
  title: string;
  publisher: string | null;
  publishedOn: string | null;
  sourceType: string;
  tier: "primary" | "secondary" | "tertiary";
  citationPrefix: string;
  chunks: KnowledgeChunkResult[];
}

export type SurfaceKnowledgeBaseStrategy =
  | "strategy2_bridged"
  | "strategy5_mode_theme"
  | "pure_semantic_fallback";

export interface SurfaceKnowledgeBaseOutput {
  documents: KnowledgeDocumentResult[];
  coverageNote: "thin" | "adequate" | "strong";
  filtersApplied: {
    modes: string[];
    themes: string[];
    strategy: SurfaceKnowledgeBaseStrategy;
    inferredModes: string[];
    inferredThemes: string[];
  };
  totalApprovedDocs?: number;
}

export interface SurfaceKnowledgeBaseRejected {
  results: [];
  reason: "below_confidence_threshold";
  topSimilarity: number;
  threshold: number;
}

function computeCoverageNote(
  matchCount: number,
): "thin" | "adequate" | "strong" {
  if (matchCount < 3) return "thin";
  if (matchCount >= 10) return "strong";
  return "adequate";
}

function buildCitationPrefix(doc: {
  title: string;
  publisher: string | null;
  publishedOn: string | null;
  tier: string;
}): string {
  const year = doc.publishedOn ? doc.publishedOn.slice(0, 4) : null;
  const pub = doc.publisher ?? "Unknown publisher";
  const yearStr = year ? `, ${year}` : "";
  return `From the Transport Knowledge Library — ${doc.title} (${pub}${yearStr}). [Tier 1b — Curated KB]`;
}

async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: query,
      model: "text-embedding-3-small",
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings API ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return json.data[0].embedding;
}

function enrichSearchRows(
  raw: Awaited<ReturnType<typeof searchKnowledgeChunks>>,
): KbRetrievalEnrichedChunk[] {
  return raw.map((r, idx) => ({
    chunkId: `${r.documentId}:${r.chunkIndex}`,
    documentId: r.documentId,
    documentTitle: r.title,
    documentModes: [],
    documentThemes: [],
    chunkIndex: r.chunkIndex,
    chunkText: r.body,
    similarity: r.similarity,
    rawRank: idx + 1,
    promotedByCap: false,
  }));
}

type SearchRow = Awaited<ReturnType<typeof searchKnowledgeChunks>>[number];

function groupCappedChunksToDocuments(
  capped: KbRetrievalEnrichedChunk[],
  rowLookup: Map<string, SearchRow>,
): KnowledgeDocumentResult[] {
  const docOrder: string[] = [];
  const docMap = new Map<string, KnowledgeDocumentResult>();

  for (const c of capped) {
    const row = rowLookup.get(`${c.documentId}:${c.chunkIndex}`);
    if (!row) continue;

    if (!docMap.has(c.documentId)) {
      docOrder.push(c.documentId);
      docMap.set(c.documentId, {
        documentId: row.documentId,
        title: row.title,
        publisher: row.publisher,
        publishedOn: row.publishedOn,
        sourceType: row.sourceType,
        tier: (row.tier ?? "secondary") as "primary" | "secondary" | "tertiary",
        citationPrefix: buildCitationPrefix({
          title: row.title,
          publisher: row.publisher,
          publishedOn: row.publishedOn,
          tier: row.tier,
        }),
        chunks: [],
      });
    }

    docMap.get(c.documentId)!.chunks.push({
      chunkIndex: row.chunkIndex,
      body: row.body,
      similarity: c.similarity,
      tokenCount: row.tokenCount,
    });
  }

  return docOrder.map((id) => docMap.get(id)!);
}

function buildRowLookup(
  rows: Awaited<ReturnType<typeof searchKnowledgeChunks>>,
): Map<string, Awaited<ReturnType<typeof searchKnowledgeChunks>>[number]> {
  const m = new Map<
    string,
    Awaited<ReturnType<typeof searchKnowledgeChunks>>[number]
  >();
  for (const r of rows) {
    m.set(`${r.documentId}:${r.chunkIndex}`, r);
  }
  return m;
}

/** Unfiltered vector search — same pool size as the harness before per-doc cap. */
async function runPureSemanticFallback(
  embeddingLiteral: string,
): Promise<Awaited<ReturnType<typeof searchKnowledgeChunks>>> {
  return searchKnowledgeChunks({
    embeddingLiteral,
    topK: KB_RETRIEVAL_RAW_TOP_K,
  });
}

async function executeSurfaceKnowledgeBase(
  params: SurfaceKnowledgeBaseInput,
  agent?: { id: string; name?: string | null },
): Promise<SurfaceKnowledgeBaseOutput | SurfaceKnowledgeBaseRejected> {
  const query = params.query;
  const inferredModes = inferModesFromQuery(query).modes;
  const inferredThemes = inferThemesFromQuery(query);

  let embedding: number[];
  try {
    embedding = await embedQuery(query);
  } catch (_err) {
    return {
      results: [],
      reason: "below_confidence_threshold",
      topSimilarity: 0,
      threshold: CONFIDENCE_THRESHOLD,
    } as SurfaceKnowledgeBaseRejected;
  }

  const embeddingLiteral = `[${embedding.join(",")}]`;

  const branch: KbRetrievalBranch = kbRetrievalBranchForAgent(agent);
  const built = buildSearchParamsForBranch(query, branch);

  let strategyTag: SurfaceKnowledgeBaseStrategy =
    branch === "strategy2_bridged"
      ? "strategy2_bridged"
      : "strategy5_mode_theme";

  let rawResults: Awaited<ReturnType<typeof searchKnowledgeChunks>>;
  try {
    rawResults = await searchKnowledgeChunks({
      embeddingLiteral,
      modes: built.modes,
      themes: built.themes,
      topK: KB_RETRIEVAL_RAW_TOP_K,
    });
  } catch (_err) {
    try {
      rawResults = await runPureSemanticFallback(embeddingLiteral);
      strategyTag = "pure_semantic_fallback";
    } catch {
      return {
        results: [],
        reason: "below_confidence_threshold",
        topSimilarity: 0,
        threshold: CONFIDENCE_THRESHOLD,
      } as SurfaceKnowledgeBaseRejected;
    }
  }

  if (
    rawResults.length === 0 ||
    (rawResults[0]?.similarity ?? 0) < CONFIDENCE_THRESHOLD
  ) {
    if (strategyTag !== "pure_semantic_fallback") {
      try {
        rawResults = await runPureSemanticFallback(embeddingLiteral);
        strategyTag = "pure_semantic_fallback";
      } catch {
        return {
          results: [],
          reason: "below_confidence_threshold",
          topSimilarity: rawResults[0]?.similarity ?? 0,
          threshold: CONFIDENCE_THRESHOLD,
        } as SurfaceKnowledgeBaseRejected;
      }
    }
  }

  if (
    rawResults.length === 0 ||
    (rawResults[0]?.similarity ?? 0) < CONFIDENCE_THRESHOLD
  ) {
    return {
      results: [],
      reason: "below_confidence_threshold",
      topSimilarity: rawResults[0]?.similarity ?? 0,
      threshold: CONFIDENCE_THRESHOLD,
    } as SurfaceKnowledgeBaseRejected;
  }

  const rowLookup = buildRowLookup(rawResults);

  const enriched = enrichSearchRows(rawResults);
  const capped = applyDiversityCap(
    enriched,
    KB_RETRIEVAL_CAP_PER_DOC,
    KB_RETRIEVAL_FINAL_TOP_K,
  );
  const documents = groupCappedChunksToDocuments(capped, rowLookup);

  const coverageNote = computeCoverageNote(documents.length);

  const filtersAppliedModes =
    strategyTag === "pure_semantic_fallback"
      ? ([] as string[])
      : [...(built.modes ?? [])];
  const filtersAppliedThemes =
    strategyTag === "pure_semantic_fallback"
      ? ([] as string[])
      : [...(built.themes ?? [])];

  return {
    documents,
    coverageNote,
    filtersApplied: {
      modes: filtersAppliedModes,
      themes: filtersAppliedThemes,
      strategy: strategyTag,
      inferredModes,
      inferredThemes,
    },
  };
}

/** @public Default tool instance (HYVE / unnamed → Strategy 2). */
export const surfaceKnowledgeBaseTool = createTool({
  description: SURFACE_KNOWLEDGE_BASE_TOOL_DESCRIPTION,
  inputSchema,
  execute: async (
    params: SurfaceKnowledgeBaseInput,
  ): Promise<SurfaceKnowledgeBaseOutput | SurfaceKnowledgeBaseRejected> => {
    return executeSurfaceKnowledgeBase(params, undefined);
  },
});

/** Per-request binding (Phase 7): JARVIS vs ATLAS branching. */
export function createSurfaceKnowledgeBaseTool(agent?: {
  id: string;
  name?: string | null;
}) {
  return createTool({
    description: SURFACE_KNOWLEDGE_BASE_TOOL_DESCRIPTION,
    inputSchema,
    execute: async (
      params: SurfaceKnowledgeBaseInput,
    ): Promise<SurfaceKnowledgeBaseOutput | SurfaceKnowledgeBaseRejected> =>
      executeSurfaceKnowledgeBase(params, agent),
  });
}
