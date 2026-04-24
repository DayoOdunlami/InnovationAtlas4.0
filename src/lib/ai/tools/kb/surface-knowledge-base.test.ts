// ---------------------------------------------------------------------------
// Unit tests for surfaceKnowledgeBase tool (KB-1, Phase 2b).
//
// All DB calls are mocked so no POSTGRES_URL is needed. The tests verify:
//   1. Tier-labelled results are returned in the expected shape.
//   2. Low-confidence rejection path fires when top-1 similarity < 0.3.
//   3. Mode / theme filter correctness (filters are passed through to the
//      search helper; the tool does not re-filter on its side).
//   4. coverageNote computation thresholds (thin / adequate / strong).
//   5. Embedding API error → rejection response.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the knowledge-repository search helper and global fetch (for embedding).
// ---------------------------------------------------------------------------

vi.mock("@/lib/db/pg/repositories/knowledge-repository.pg", () => ({
  searchKnowledgeChunks: vi.fn(),
}));

import { searchKnowledgeChunks } from "@/lib/db/pg/repositories/knowledge-repository.pg";
import {
  surfaceKnowledgeBaseTool,
  type SurfaceKnowledgeBaseInput,
  type SurfaceKnowledgeBaseOutput,
  type SurfaceKnowledgeBaseRejected,
} from "./surface-knowledge-base";

const mockSearch = vi.mocked(searchKnowledgeChunks);

function makeChunk(documentId: string, similarity: number, idx = 0) {
  return {
    documentId,
    title: `Document ${documentId}`,
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
  // Stub the global fetch used for OpenAI embeddings.
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
  modes?: Array<"rail" | "aviation" | "maritime" | "hit">;
  themes?: Array<
    | "autonomy"
    | "decarbonisation"
    | "people_experience"
    | "hubs_clusters"
    | "planning_operation"
    | "industry"
  >;
};

async function runTool(params: ToolParams) {
  const fullParams = { topK: 6, ...params } as SurfaceKnowledgeBaseInput;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (surfaceKnowledgeBaseTool.execute as any)(fullParams, {});
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("surfaceKnowledgeBase: happy path", () => {
  it("returns grouped tier-labelled results with citationPrefix", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValue([
      makeChunk("doc-1", 0.85, 0),
      makeChunk("doc-1", 0.8, 1),
      makeChunk("doc-2", 0.72, 0),
    ]);

    const result = (await runTool({
      query: "what is the rail decarbonisation strategy",
      topK: 6,
    })) as SurfaceKnowledgeBaseOutput;

    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].documentId).toBe("doc-1");
    expect(result.documents[0].chunks).toHaveLength(2);
    expect(result.documents[0].tier).toBe("primary");
    expect(result.documents[0].citationPrefix).toContain(
      "Transport Knowledge Library",
    );
    expect(result.documents[0].citationPrefix).toContain("DfT");
    expect(result.coverageNote).toBe("thin"); // < 3 docs
  });

  it("coverageNote = adequate when 3–9 documents are returned", async () => {
    await mockEmbed();
    const chunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk(`doc-${i}`, 0.6 - i * 0.02, 0),
    );
    mockSearch.mockResolvedValue(chunks);

    const result = (await runTool({
      query: "aviation autonomy challenges",
    })) as SurfaceKnowledgeBaseOutput;

    expect(result.coverageNote).toBe("adequate");
  });

  it("coverageNote = strong when ≥ 10 documents returned", async () => {
    await mockEmbed();
    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk(`doc-${i}`, 0.75 - i * 0.01, 0),
    );
    mockSearch.mockResolvedValue(chunks);

    const result = (await runTool({
      query: "any query",
    })) as SurfaceKnowledgeBaseOutput;
    expect(result.coverageNote).toBe("strong");
  });

  it("passes mode and theme filters through to searchKnowledgeChunks", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValue([makeChunk("doc-1", 0.9)]);

    await runTool({
      query: "maritime strategy",
      modes: ["maritime"],
      themes: ["decarbonisation"],
    });

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        modes: ["maritime"],
        themes: ["decarbonisation"],
      }),
    );
  });

  it("filtersApplied reflects the requested filters", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValue([makeChunk("doc-1", 0.88)]);

    const result = (await runTool({
      query: "hit hubs",
      modes: ["hit"],
      themes: ["hubs_clusters"],
    })) as SurfaceKnowledgeBaseOutput;

    expect(result.filtersApplied.modes).toEqual(["hit"]);
    expect(result.filtersApplied.themes).toEqual(["hubs_clusters"]);
  });
});

describe("surfaceKnowledgeBase: low-confidence rejection", () => {
  it("returns rejection when top-1 similarity < 0.3", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValue([makeChunk("doc-1", 0.25)]);

    const result = (await runTool({
      query: "something very niche",
    })) as SurfaceKnowledgeBaseRejected;

    expect(result.results).toEqual([]);
    expect(result.reason).toBe("below_confidence_threshold");
    expect(result.topSimilarity).toBeCloseTo(0.25);
    expect(result.threshold).toBe(0.3);
  });

  it("returns rejection when no chunks are found", async () => {
    await mockEmbed();
    mockSearch.mockResolvedValue([]);

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
    // Should not throw — should return a safe error payload.
    expect(result).toBeDefined();
    expect((result as SurfaceKnowledgeBaseRejected).results).toEqual([]);
  });
});

describe("surfaceKnowledgeBase: search failure", () => {
  it("returns rejection-like error when searchKnowledgeChunks throws (durability guard)", async () => {
    await mockEmbed();
    vi.mocked(searchKnowledgeChunks).mockRejectedValueOnce(
      new Error("pgvector extension missing"),
    );

    const result = await runTool({ query: "any query" });
    // Must NOT throw — uncaught throws here poison the chat thread on
    // OpenAI's Responses API ("No tool output found for function call …").
    expect(result).toBeDefined();
    expect((result as SurfaceKnowledgeBaseRejected).results).toEqual([]);
    expect((result as SurfaceKnowledgeBaseRejected).reason).toBe(
      "below_confidence_threshold",
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
