import { NextResponse } from "next/server";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { requireAdminPermission } from "auth/permissions";
import {
  pgKnowledgeRepository,
  searchKnowledgeChunks,
} from "@/lib/db/pg/repositories/knowledge-repository.pg";
import {
  KB_RETRIEVAL_FINAL_TOP_K,
  applyDiversityCap,
  bridgedModesFromInferred,
  inferModesFromQuery,
  inferThemesFromQuery,
  type KbRetrievalEnrichedChunk,
} from "@/lib/kb/retrieval-strategies";

type Body = {
  query?: string;
  agent?: "atlas" | "jarvis";
  capPerDoc?: number | null;
};

type EnrichedChunk = KbRetrievalEnrichedChunk;

type StrategyResult = {
  filter: { modes?: string[]; themes?: string[] };
  rawCandidates: number;
  chunks: EnrichedChunk[];
  durationMs: number;
};

const systemScope = { kind: "system" } as const;
const RAW_TOP_K = 20;

async function runStrategy(
  params: Parameters<typeof searchKnowledgeChunks>[0],
  docsMeta: Map<string, { modes: string[]; themes: string[] }>,
  capPerDoc: number | null,
): Promise<StrategyResult> {
  const started = Date.now();
  const raw = await searchKnowledgeChunks(params);
  const enriched: EnrichedChunk[] = raw.map((r, idx) => {
    const meta = docsMeta.get(r.documentId) ?? { modes: [], themes: [] };
    return {
      chunkId: `${r.documentId}:${r.chunkIndex}`,
      documentId: r.documentId,
      documentTitle: r.title,
      documentModes: meta.modes,
      documentThemes: meta.themes,
      chunkIndex: r.chunkIndex,
      chunkText: r.body,
      similarity: r.similarity,
      rawRank: idx + 1,
      promotedByCap: false,
    };
  });

  return {
    filter: {
      modes: params.modes,
      themes: params.themes,
    },
    rawCandidates: enriched.length,
    chunks: applyDiversityCap(enriched, capPerDoc, KB_RETRIEVAL_FINAL_TOP_K),
    durationMs: Date.now() - started,
  };
}

export async function POST(req: Request) {
  try {
    await requireAdminPermission();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const capPerDoc =
    body.capPerDoc === null || body.capPerDoc === undefined
      ? (body.capPerDoc ?? 2)
      : Number(body.capPerDoc);

  const t0 = Date.now();
  try {
    const [docs, embedded] = await Promise.all([
      pgKnowledgeRepository.listDocuments({}, systemScope),
      embed({
        model: openai.embedding("text-embedding-3-small"),
        value: query,
      }),
    ]);

    const docsMeta = new Map<string, { modes: string[]; themes: string[] }>(
      docs.map((d) => [
        d.id,
        {
          modes: (d.modes ?? []) as string[],
          themes: (d.themes ?? []) as string[],
        },
      ]),
    );

    const embeddingLiteral = `[${embedded.embedding.join(",")}]`;
    const inferred = inferModesFromQuery(query);
    const inferredModes = inferred.modes;
    const inferredThemes = inferThemesFromQuery(query);
    const bridgedModes = bridgedModesFromInferred(inferredModes);

    const [strategy1, strategy2, strategy3, strategy4, strategy5] =
      await Promise.all([
        runStrategy(
          {
            embeddingLiteral,
            modes: inferredModes.length ? inferredModes : undefined,
            topK: RAW_TOP_K,
          },
          docsMeta,
          capPerDoc ?? null,
        ),
        runStrategy(
          {
            embeddingLiteral,
            modes: bridgedModes.length ? bridgedModes : undefined,
            topK: RAW_TOP_K,
          },
          docsMeta,
          capPerDoc ?? null,
        ),
        runStrategy(
          {
            embeddingLiteral,
            topK: RAW_TOP_K,
          },
          docsMeta,
          capPerDoc ?? null,
        ),
        runStrategy(
          {
            embeddingLiteral,
            modes: ["data_digital"],
            topK: RAW_TOP_K,
          },
          docsMeta,
          capPerDoc ?? null,
        ),
        runStrategy(
          {
            embeddingLiteral,
            modes: inferredModes.length ? inferredModes : undefined,
            themes: inferredThemes.length ? inferredThemes : undefined,
            topK: RAW_TOP_K,
          },
          docsMeta,
          capPerDoc ?? null,
        ),
      ]);

    return NextResponse.json({
      query,
      agent: body.agent ?? "atlas",
      inferredModes,
      inferredThemes,
      inferenceDebug: {
        fallbackApplied: inferred.fallbackApplied,
        fallbackReason: inferred.fallbackReason,
      },
      capPerDoc: capPerDoc ?? null,
      strategies: {
        strategy1_strict: strategy1,
        strategy2_bridged: strategy2,
        strategy3_pure: strategy3,
        strategy4_dd_only: strategy4,
        strategy5_mode_theme: strategy5,
      },
      totalDurationMs: Date.now() - t0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "kb retrieval test failed", detail: message },
      { status: 500 },
    );
  }
}
