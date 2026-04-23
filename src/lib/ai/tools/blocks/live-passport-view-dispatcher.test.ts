// ---------------------------------------------------------------------------
// Dispatcher tests — AppendLivePassportView (Phase 3a).
//
// Asserts:
//   1. Valid passportId (UUID) produces a blockId in the return value.
//   2. Invalid passportId (not a UUID) is rejected by the Zod schema.
//   3. Invalid briefId (not a UUID) is rejected.
//   4. The created block has type "live-passport-view" and the correct
//      content_json shape { passportId, schema_version: 1 }.
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach } from "vitest";
import { DefaultToolName } from "@/lib/ai/tools";

vi.mock("@/lib/db/pg/repositories/block-repository.pg", () => {
  const store = new Map<string, unknown>();
  return {
    pgBlockRepository: {
      create: vi.fn(
        async (input: { type: string; contentJson: unknown; id?: string }) => {
          const id = input.id ?? "01FAKELPV0000000000000000";
          const row = {
            id,
            briefId: "00000000-0000-0000-0000-000000000001",
            type: input.type,
            position: "a0",
            contentJson: input.contentJson,
            source: "agent",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.set(id, row);
          return row;
        },
      ),
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

import { dispatchBlockTool } from "./index";
import { pgBlockRepository } from "@/lib/db/pg/repositories/block-repository.pg";

const scope = { kind: "user", userId: "owner-1" } as const;
const briefId = "123e4567-e89b-42d3-a456-426614174000";
// Valid UUID v4 (version nibble = 4, variant nibble = 8-b)
const passportId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AppendLivePassportView dispatcher", () => {
  it("accepts valid briefId + passportId (both UUIDs)", async () => {
    const out = await dispatchBlockTool({
      name: DefaultToolName.AppendLivePassportView,
      args: { briefId, passportId },
      scope,
    });
    expect(out).toHaveProperty("blockId");
  });

  it("creates block with type live-passport-view", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.AppendLivePassportView,
      args: { briefId, passportId },
      scope,
    });
    expect(pgBlockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "live-passport-view",
      }),
      scope,
    );
  });

  it("stores passportId + schema_version:1 in contentJson", async () => {
    await dispatchBlockTool({
      name: DefaultToolName.AppendLivePassportView,
      args: { briefId, passportId },
      scope,
    });
    expect(pgBlockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson: {
          passportId,
          schema_version: 1,
        },
      }),
      scope,
    );
  });

  it("rejects an invalid passportId (not a UUID)", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendLivePassportView,
        args: { briefId, passportId: "not-a-uuid" },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("rejects an invalid briefId (not a UUID)", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendLivePassportView,
        args: { briefId: "bad-brief-id", passportId },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("rejects when passportId is missing entirely", async () => {
    await expect(
      dispatchBlockTool({
        name: DefaultToolName.AppendLivePassportView,
        args: { briefId },
        scope,
      }),
    ).rejects.toThrow();
  });

  it("accepts optional afterBlockId (null)", async () => {
    const out = await dispatchBlockTool({
      name: DefaultToolName.AppendLivePassportView,
      args: { briefId, passportId, afterBlockId: null },
      scope,
    });
    expect(out).toHaveProperty("blockId");
  });
});
