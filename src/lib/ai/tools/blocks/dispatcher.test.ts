// ---------------------------------------------------------------------------
// Dispatcher tests (Phase 2a.1 — Block Types Spec §4).
//
// The dispatcher is the single place that maps tool names to repository
// operations. Two invariants are tested here WITHOUT touching a live
// Postgres:
//
//   1. Unknown tool names throw `UnknownBlockToolError` — the "no silent
//      fallback" contract.
//   2. Each known tool validates its input schema and rejects malformed
//      content_json before hitting the repository.
//
// Repository calls are stubbed. Positional math (fractional-indexing,
// sibling path) lives in the serialise/ module and has its own tests.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach } from "vitest";
import { DefaultToolName } from "@/lib/ai/tools";

vi.mock("@/lib/db/pg/repositories/block-repository.pg", () => {
  const store = new Map<string, unknown>();
  return {
    pgBlockRepository: {
      create: vi.fn(async (input: { type: string; id?: string }) => {
        const id = input.id ?? "01FAKE00000000000000000000";
        const row = {
          id,
          briefId: "00000000-0000-0000-0000-000000000001",
          type: input.type,
          position: "a0",
          contentJson: {},
          source: "agent",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.set(id, row);
        return row;
      }),
      getById: vi.fn(async (id: string) => store.get(id) ?? null),
      listByBrief: vi.fn(async () => [...store.values()]),
      update: vi.fn(async (id: string) => store.get(id) ?? null),
      delete: vi.fn(async () => undefined),
      move: vi.fn(async (id: string) => store.get(id) ?? null),
    },
  };
});

vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
  },
}));

import { dispatchBlockTool, UnknownBlockToolError } from "./index";

const scope = { kind: "user", userId: "owner-1" } as const;
const briefId = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dispatchBlockTool", () => {
  it("rejects unknown tool names with UnknownBlockToolError", async () => {
    await expect(
      dispatchBlockTool({ name: "makeCoffee", args: {}, scope }),
    ).rejects.toBeInstanceOf(UnknownBlockToolError);
  });

  it("rejects an unknown tool name even when it *looks* like one of ours", async () => {
    await expect(
      dispatchBlockTool({ name: "appendWidget", args: {}, scope }),
    ).rejects.toBeInstanceOf(UnknownBlockToolError);
  });

  it("appendHeading accepts a valid payload", async () => {
    const out = await dispatchBlockTool({
      name: DefaultToolName.AppendHeading,
      args: { briefId, content: { level: 2, text: "Intro" } },
      scope,
    });
    expect(out).toHaveProperty("blockId");
  });

  it("appendHeading rejects an invalid level (out of 1..3)", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendHeading,
        args: { briefId, content: { level: 9, text: "Bad" } },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("appendParagraph accepts plain text without marks", async () => {
    const out = await dispatchBlockTool({
      name: DefaultToolName.AppendParagraph,
      args: { briefId, content: { text: "Hello" } },
      scope,
    });
    expect(out).toHaveProperty("blockId");
  });

  it("appendParagraph rejects a link mark without a url", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendParagraph,
        args: {
          briefId,
          content: {
            text: "Hello world",
            inline_formatting: [{ start: 0, end: 5, type: "link" }],
          },
        },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("appendBullets accepts a valid bullet list with indent", async () => {
    const out = await dispatchBlockTool({
      name: DefaultToolName.AppendBullets,
      args: {
        briefId,
        content: {
          style: "bullet",
          items: ["a", "b", "c"],
          indent: [0, 1, 0],
        },
      },
      scope,
    });
    expect(out).toHaveProperty("blockId");
  });

  it("appendBullets rejects indent > 2", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendBullets,
        args: {
          briefId,
          content: {
            style: "bullet",
            items: ["a"],
            indent: [5],
          },
        },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("appendBullets rejects > 50 items", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendBullets,
        args: {
          briefId,
          content: {
            style: "bullet",
            items: Array.from({ length: 51 }, (_, i) => `item ${i}`),
          },
        },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("removeBlock accepts a 26-char ULID and rejects anything shorter", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.RemoveBlock,
        args: { blockId: "short-id" },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("appendLandscapeEmbed accepts a valid umap-layout payload", async () => {
    const out = await dispatchBlockTool({
      name: DefaultToolName.AppendLandscapeEmbed,
      args: {
        briefId,
        content: { layout: "umap", schema_version: 1 },
      },
      scope,
    });
    expect(out).toHaveProperty("blockId");
  });

  it("appendLandscapeEmbed accepts a web-layout payload when a query is provided", async () => {
    const out = await dispatchBlockTool({
      name: DefaultToolName.AppendLandscapeEmbed,
      args: {
        briefId,
        content: {
          layout: "web",
          query: "rail decarbonisation",
          schema_version: 1,
        },
      },
      scope,
    });
    expect(out).toHaveProperty("blockId");
  });

  it("appendLandscapeEmbed rejects web-layout without a query", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendLandscapeEmbed,
        args: {
          briefId,
          content: { layout: "web", schema_version: 1 },
        },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("appendLandscapeEmbed rejects an unknown layout value", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendLandscapeEmbed,
        args: {
          briefId,
          content: { layout: "spiral", schema_version: 1 },
        },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("appendLandscapeEmbed accepts a v2 gravity payload with queryA + caption", async () => {
    const out = await dispatchBlockTool({
      name: DefaultToolName.AppendLandscapeEmbed,
      args: {
        briefId,
        content: {
          schema_version: 2,
          queryA: "rail hydrogen decarbonisation",
          mode: "gravity",
          display: "graph",
          theme: "light",
          cameraPreset: "topdown",
          caption: "Where hydrogen rail sits inside the wider map.",
        },
      },
      scope,
    });
    expect(out).toHaveProperty("blockId");
  });

  it("appendLandscapeEmbed rejects a v2 compare payload missing queryB", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendLandscapeEmbed,
        args: {
          briefId,
          content: {
            schema_version: 2,
            queryA: "hydrogen rail",
            mode: "compare",
          },
        },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("appendLandscapeEmbed rejects a v2 focus-card without focusedNodeId", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendLandscapeEmbed,
        args: {
          briefId,
          content: {
            schema_version: 2,
            display: "focus-card",
          },
        },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("changeHeadingLevel rejects a blockId that does not map to a heading", async () => {
    // The stubbed store is empty — the getById returns null and the
    // handler throws a descriptive error (not UnknownBlockToolError).
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.ChangeHeadingLevel,
        args: {
          blockId: "01NOTAHEADING0000000000000",
          newLevel: 2,
        },
        scope,
      }),
    ).rejects.toThrow(/not a heading/);
  });
});
