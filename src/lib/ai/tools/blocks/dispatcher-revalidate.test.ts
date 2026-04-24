// ---------------------------------------------------------------------------
// Dispatcher revalidate regression tests (Phase 3e-a — Live Sync for
// AI-generated blocks).
//
// Every successful mutation path in `dispatchBlockTool` must call
// `revalidatePath("/brief/{briefId}")` so the Next.js RSC cache is
// invalidated and the server-rendered BlockList re-runs on the next
// request. Without this the user had to press F5 to see a block the
// agent had just written.
//
// These tests stub the repository + Postgres + `next/cache` and assert
// the revalidate call was made with the correct path on each verb. They
// are deliberately NOT input-shape tests (the existing dispatcher.test.ts
// covers that) — this file only asserts the cache invalidation contract.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultToolName } from "@/lib/ai/tools";

const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string, ...rest: unknown[]) =>
    revalidatePathMock(path, ...rest),
}));

const MOCK_BRIEF_ID = "123e4567-e89b-42d3-a456-426614174000";

vi.mock("@/lib/db/pg/repositories/block-repository.pg", () => {
  const store = new Map<string, unknown>();
  return {
    pgBlockRepository: {
      create: vi.fn(async (input: { type: string; id?: string }) => {
        const id = input.id ?? "01FAKE00000000000000000000";
        const row = {
          id,
          briefId: MOCK_BRIEF_ID,
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
      getById: vi.fn(async (id: string) => {
        if (store.has(id)) return store.get(id);
        return {
          id,
          briefId: MOCK_BRIEF_ID,
          type: "paragraph",
          position: "a0",
          contentJson: { text: "stub" },
          source: "agent",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
      listByBrief: vi.fn(async () => [...store.values()]),
      update: vi.fn(async (id: string) => ({
        id,
        briefId: MOCK_BRIEF_ID,
        type: "paragraph",
        position: "a0",
        contentJson: {},
        source: "agent",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      delete: vi.fn(async () => undefined),
      move: vi.fn(async (id: string) => ({
        id,
        briefId: MOCK_BRIEF_ID,
        type: "paragraph",
        position: "b0",
        contentJson: {},
        source: "agent",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
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

import { dispatchBlockTool } from "./index";

const scope = { kind: "user", userId: "owner-1" } as const;
const BLOCK_ID = "01FAKE00000000000000000000";

beforeEach(() => {
  revalidatePathMock.mockClear();
});

describe("dispatchBlockTool — revalidatePath (3e-a live sync)", () => {
  it("appendHeading revalidates /brief/{briefId}", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.AppendHeading,
      args: {
        briefId: MOCK_BRIEF_ID,
        content: { level: 2, text: "Intro" },
      },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("appendParagraph revalidates /brief/{briefId}", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.AppendParagraph,
      args: { briefId: MOCK_BRIEF_ID, content: { text: "Hello" } },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("appendBullets revalidates /brief/{briefId}", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.AppendBullets,
      args: {
        briefId: MOCK_BRIEF_ID,
        content: { style: "bullet", items: ["a"] },
      },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("appendLandscapeEmbed revalidates /brief/{briefId}", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.AppendLandscapeEmbed,
      args: {
        briefId: MOCK_BRIEF_ID,
        content: { layout: "umap", schema_version: 1 },
      },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("appendLivePassportView revalidates /brief/{briefId}", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.AppendLivePassportView,
      args: {
        briefId: MOCK_BRIEF_ID,
        passportId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("updateBlock revalidates /brief/{briefId} (briefId derived from block row)", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.UpdateBlock,
      args: { blockId: BLOCK_ID, content: { text: "edit" } },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("removeBlock revalidates /brief/{briefId}", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.RemoveBlock,
      args: { blockId: BLOCK_ID },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("duplicateBlock revalidates /brief/{briefId}", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.DuplicateBlock,
      args: { blockId: BLOCK_ID },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("moveBlock revalidates /brief/{briefId}", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.MoveBlock,
      args: { blockId: BLOCK_ID, newIndex: 0 },
      scope,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/brief/${MOCK_BRIEF_ID}`);
  });

  it("getBrief is read-only and does NOT revalidate", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.GetBrief,
      args: { briefId: MOCK_BRIEF_ID },
      scope,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
