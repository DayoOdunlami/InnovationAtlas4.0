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
// Scope fence: reads only. Never writes to atlas.knowledge_*.
// ---------------------------------------------------------------------------

import { tool as createTool } from "ai";
import { z } from "zod";
import { searchKnowledgeChunks } from "@/lib/db/pg/repositories/knowledge-repository.pg";

const CONFIDENCE_THRESHOLD = 0.3;
const DEFAULT_TOP_K = 6;
const MAX_TOP_K = 10;

const KnowledgeModeSchema = z.enum(["rail", "aviation", "maritime", "hit"]);

const KnowledgeThemeSchema = z.enum([
  "autonomy",
  "decarbonisation",
  "people_experience",
  "hubs_clusters",
  "planning_operation",
  "industry",
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
  "Use when the user asks about policy, strategy, control periods, spending envelopes, sector challenges, or thematic context that lives in government strategy papers, regulator annual reports, DfT plans, Network Rail strategic documents, ORR reports, or similar official publications.",
  'Triggering phrases: "what does the CP7/CP8 strategy say", "what is the DfT position on", "what are the known challenges in", "what does the rail/aviation/maritime/HIT strategy say about", "what policy framework applies to", or any request for high-level sector context rather than specific funded projects.',
  "Do NOT use for: funded-project counts or project lists (use supabase-atlas); academic findings or peer-reviewed evidence (use surfaceResearch); current news or live funding calls (use web search); or when the question is about a specific organisation or person.",
  "Returns tier-labelled chunks with full provenance. ALWAYS cite the document title, publisher, and year inline. If coverageNote is 'thin', say so honestly and suggest using Atlas corpus or web search for broader coverage.",
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

export interface SurfaceKnowledgeBaseOutput {
  documents: KnowledgeDocumentResult[];
  coverageNote: "thin" | "adequate" | "strong";
  filtersApplied: { modes: string[]; themes: string[] };
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

export const surfaceKnowledgeBaseTool = createTool({
  description: SURFACE_KNOWLEDGE_BASE_TOOL_DESCRIPTION,
  inputSchema,
  execute: async (
    params: SurfaceKnowledgeBaseInput,
  ): Promise<SurfaceKnowledgeBaseOutput | SurfaceKnowledgeBaseRejected> => {
    const topK = Math.min(MAX_TOP_K, Math.max(1, params.topK ?? DEFAULT_TOP_K));
    const modes = params.modes ?? [];
    const themes = params.themes ?? [];

    let embedding: number[];
    try {
      embedding = await embedQuery(params.query);
    } catch (_err) {
      return {
        results: [],
        reason: "below_confidence_threshold",
        topSimilarity: 0,
        threshold: CONFIDENCE_THRESHOLD,
      } as SurfaceKnowledgeBaseRejected;
    }

    const embeddingLiteral = `[${embedding.join(",")}]`;

    const rawResults = await searchKnowledgeChunks({
      embeddingLiteral,
      modes: modes.length > 0 ? modes : undefined,
      themes: themes.length > 0 ? themes : undefined,
      topK,
    });

    // Over-grounding guard: reject if top-1 similarity is below threshold.
    if (
      rawResults.length === 0 ||
      rawResults[0].similarity < CONFIDENCE_THRESHOLD
    ) {
      return {
        results: [],
        reason: "below_confidence_threshold",
        topSimilarity: rawResults[0]?.similarity ?? 0,
        threshold: CONFIDENCE_THRESHOLD,
      };
    }

    // Group chunks by document, preserving similarity order.
    const docMap = new Map<string, KnowledgeDocumentResult>();
    for (const chunk of rawResults) {
      if (!docMap.has(chunk.documentId)) {
        docMap.set(chunk.documentId, {
          documentId: chunk.documentId,
          title: chunk.title,
          publisher: chunk.publisher,
          publishedOn: chunk.publishedOn,
          sourceType: chunk.sourceType,
          tier: (chunk.tier ?? "secondary") as
            | "primary"
            | "secondary"
            | "tertiary",
          citationPrefix: buildCitationPrefix({
            title: chunk.title,
            publisher: chunk.publisher,
            publishedOn: chunk.publishedOn,
            tier: chunk.tier,
          }),
          chunks: [],
        });
      }
      docMap.get(chunk.documentId)!.chunks.push({
        chunkIndex: chunk.chunkIndex,
        body: chunk.body,
        similarity: chunk.similarity,
        tokenCount: chunk.tokenCount,
      });
    }

    const documents = [...docMap.values()];
    const coverageNote = computeCoverageNote(documents.length);

    return {
      documents,
      coverageNote,
      filtersApplied: { modes, themes },
    };
  },
});
