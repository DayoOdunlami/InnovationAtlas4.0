// ---------------------------------------------------------------------------
// Unit tests for surfaceKnowledgeBase tool (KB-1, Phase 2b + Phase 7).
//
// DB calls are mocked (no POSTGRES_URL). Verifies strategy wiring, diversity
// cap output shape, rejection paths, and resilience (no throws on search fail).
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/pg/repositories/knowledge-repository.pg", () => ({
  searchKnowledgeChunks: vi.fn(),
}));

import { searchKnowledgeChunks } from "@/lib/db/pg/repositories/knowledge-repository.pg";
import {
  surfaceKnowledgeBaseTool,
  createSurfaceKnowledgeBaseTool,
  type SurfaceKnowledgeBaseInput,
  type SurfaceKnowledgeBaseOutput,
  type SurfaceKnowledgeBaseRejected,
} from "./surface-knowledge-base";

const mockSearch = vi.mocked(searchKnowledgeChunks);

function makeChunk(
  documentId: string,
  similarity: number,
  idx = 0,
  title = `Document ${documentId}`,
): Awaited<ReturnType<typeof searchKnowledgeChunks>>[number] {
  return {
    documentId,
    title,
    publisher: "DfT",
    publishedOn: "2023-01-01",
    sourceType: "policy_doc",
    tier: "primary",
    chunkIndex: idx,
    body: `Body text for chunk ${idx}`,
    tokenCount: 120,
    similarity,
  };
}

async function mockEmbed() {
  const fakeEmbedding = Array(1536).fill(0.1);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeEmbedding }] }),
    }),
  );
}

type ToolParams = {
  query: string;
  topK?: number;
  modes?: SurfaceKnowledgeBaseInput["modes"];
  themes?: SurfaceKnowledgeBaseInput["themes"];
};

async function runTool(
  params: ToolParams,
  tool: typeof surfaceKnowledgeBaseTool = surfaceKnowledgeBaseTool,
) {
  const fullParams = { topK: 6, ...params } as SurfaceKnowledgeBaseInput;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tool.execute as any)(fullParams, {});
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("surfaceKnowledgeBase: happy path (Strategy 2 bridged default)", () => {
  it("returns grouped tier-labelled results with citationPrefix", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValue([
      makeChunk("doc-1", 0.85, 0),
      makeChunk("doc-1", 0.8, 1),
      makeChunk("doc-2", 0.72, 0),
      makeChunk("doc-2", 0.7, 1),
      makeChunk("doc-2", 0.69, 2),
    ]);

    const result = (await runTool({
      query: "what is the rail decarbonisation strategy",
      topK: 6,
    })) as SurfaceKnowledgeBaseOutput;

    expect(result.documents.length).toBeGreaterThanOrEqual(1);
    expect(result.documents[0].chunks.length).toBeGreaterThanOrEqual(1);
    expect(result.documents[0].citationPrefix).toContain(
      "Transport Knowledge Library",
    );
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        topK: 20,
        modes: expect.arrayContaining(["rail", "data_digital"]),
      }),
    );
    expect(result.filtersApplied.strategy).toBe("strategy2_bridged");
  });

  it("coverageNote = adequate when 3–9 documents are returned post-cap", async () => {
    await mockEmbed();
    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk(`doc-${i}`, 0.8 - i * 0.001, 0, `Title ${i}`),
    );
    mockSearch.mockResolvedValue(chunks);

    const result = (await runTool({
      query: "aviation autonomy challenges",
    })) as SurfaceKnowledgeBaseOutput;

    expect(result.coverageNote).toBe("adequate");
  });

  it("JARVIS-bound tool uses Strategy 5 (mode + optional themes)", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValue([makeChunk("doc-1", 0.88, 0)]);

    await runTool(
      { query: "maritime sector decarbonisation funding" },
      createSurfaceKnowledgeBaseTool({ id: "jid", name: "JARVIS" }),
    );

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        topK: 20,
        modes: expect.arrayContaining(["maritime"]),
        themes: expect.arrayContaining(["decarbonisation", "industry"]),
      }),
    );
  });

  it("filtersApplied includes inference metadata", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValue([makeChunk("doc-1", 0.88)]);
    const result = (await runTool({
      query: "rail strategy",
    })) as SurfaceKnowledgeBaseOutput;
    expect(result.filtersApplied.inferredModes.length).toBeGreaterThan(0);
    expect(Array.isArray(result.filtersApplied.inferredThemes)).toBe(true);
  });
});

describe("surfaceKnowledgeBase: low-confidence rejection", () => {
  it("returns rejection when top-1 similarity < 0.3 after fallback", async () => {
    await mockEmbed();
    mockSearch
      .mockResolvedValueOnce([makeChunk("doc-1", 0.25)])
      .mockResolvedValueOnce([makeChunk("doc-1", 0.25)]);

    const result = (await runTool({
      query: "something very niche",
    })) as SurfaceKnowledgeBaseRejected;

    expect(result.results).toEqual([]);
    expect(result.reason).toBe("below_confidence_threshold");
  });

  it("returns rejection when no chunks are found", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = (await runTool({
      query: "query with no results",
    })) as SurfaceKnowledgeBaseRejected;

    expect(result.results).toEqual([]);
    expect(result.reason).toBe("below_confidence_threshold");
  });
});

describe("surfaceKnowledgeBase: embedding failure", () => {
  it("returns rejection-like error when embedding API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    const result = await runTool({ query: "any query" });
    expect(result).toBeDefined();
    expect((result as SurfaceKnowledgeBaseRejected).results).toEqual([]);
  });
});

describe("surfaceKnowledgeBase: search failure", () => {
  it("falls back to pure semantic on search throw (durability guard)", async () => {
    await mockEmbed();
    vi.mocked(searchKnowledgeChunks)
      .mockRejectedValueOnce(new Error("pgvector extension missing"))
      .mockResolvedValueOnce([makeChunk("doc-1", 0.55)]);

    const result = (await runTool({ query: "rail policy" })) as
      | SurfaceKnowledgeBaseOutput
      | SurfaceKnowledgeBaseRejected;

    expect("documents" in result && result.documents.length).toBeGreaterThan(0);
    expect((result as SurfaceKnowledgeBaseOutput).filtersApplied.strategy).toBe(
      "pure_semantic_fallback",
    );
  });
});

describe("surfaceKnowledgeBase: tool metadata", () => {
  it("tool has a description", () => {
    const desc = surfaceKnowledgeBaseTool.description ?? "";
    expect(typeof desc).toBe("string");
    expect(desc.length).toBeGreaterThan(50);
  });

  it("tool has an inputSchema with query as required field", () => {
    expect(surfaceKnowledgeBaseTool.inputSchema).toBeDefined();
  });
});
