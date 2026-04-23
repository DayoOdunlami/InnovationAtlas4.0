// ---------------------------------------------------------------------------
// Briefing tool kit factory tests (Phase 2b).
//
// Exercise the `buildBriefingToolKit()` glue that sits between
// `dispatchBlockTool` and the Vercel AI SDK `tool()` surface:
//
//   - empty kit when there is no verified brief
//   - empty kit for non-user scopes (share / system)
//   - `briefId` injection for append tools (the model never sees /
//     provides it on the wire)
//   - telemetry call + rejected envelopes
//   - access-denied is returned as a structured error, not thrown
//
// The block repository and the underlying dispatcher are fully mocked;
// these are true unit tests. Integration behaviour (actual PG writes)
// is covered by `block-repository.pg.test.ts`.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { DefaultToolName } from "@/lib/ai/tools";
import { AccessDeniedError } from "@/lib/db/pg/repositories/access-scope";

// Minimal stdout destination so emitAction doesn't fan out to atlas-pg
// during the unit run.
import { __setTelemetryDestinationsForTesting } from "@/lib/telemetry/emit";
import type { TelemetryEnvelope } from "@/lib/telemetry/envelope";

const recordedEnvelopes: TelemetryEnvelope[] = [];

vi.mock("./index", async () => {
  // Keep the real `BLOCK_TOOL_SCHEMAS` + `UnknownBlockToolError`
  // exports but replace `dispatchBlockTool` with a spy we drive per
  // test. The schemas are the contract the model sees — we absolutely
  // want them real.
  const actual = await vi.importActual<typeof import("./index")>("./index");
  return {
    ...actual,
    dispatchBlockTool: vi.fn(),
  };
});

import { dispatchBlockTool } from "./index";
import { buildBriefingToolKit } from "./briefing-tool-kit";

const ownerScope = {
  kind: "user",
  userId: "user-owner-1",
} as const;
const briefId = "00000000-0000-0000-0000-000000000123";
const sessionId = "session-abc";

beforeEach(() => {
  vi.clearAllMocks();
  recordedEnvelopes.length = 0;
  __setTelemetryDestinationsForTesting([
    {
      async write(env: TelemetryEnvelope) {
        recordedEnvelopes.push(env);
      },
    },
  ]);
});

describe("buildBriefingToolKit", () => {
  it("returns an empty record when briefId is missing", () => {
    const kit = buildBriefingToolKit({
      scope: ownerScope,
      briefId: null,
      sessionId,
    });
    expect(Object.keys(kit)).toHaveLength(0);
  });

  it("returns an empty record for share scope", () => {
    const kit = buildBriefingToolKit({
      scope: { kind: "share", token: "tok" },
      briefId,
      sessionId,
    });
    expect(Object.keys(kit)).toHaveLength(0);
  });

  it("returns an empty record for system scope", () => {
    const kit = buildBriefingToolKit({
      scope: { kind: "system" },
      briefId,
      sessionId,
    });
    expect(Object.keys(kit)).toHaveLength(0);
  });

  it("exposes every per-type block tool once a brief is pinned", () => {
    const kit = buildBriefingToolKit({
      scope: ownerScope,
      briefId,
      sessionId,
    });
    const names = new Set(Object.keys(kit));
    expect(names).toContain(DefaultToolName.AppendHeading);
    expect(names).toContain(DefaultToolName.AppendParagraph);
    expect(names).toContain(DefaultToolName.AppendBullets);
    expect(names).toContain(DefaultToolName.UpdateBlock);
    expect(names).toContain(DefaultToolName.RemoveBlock);
    expect(names).toContain(DefaultToolName.DuplicateBlock);
    expect(names).toContain(DefaultToolName.MoveBlock);
    expect(names).toContain(DefaultToolName.GetBrief);
    expect(names).toContain(DefaultToolName.ChangeHeadingLevel);
    expect(names).toContain(DefaultToolName.ConvertBulletsStyle);
  });

  it("injects briefId server-side for AppendHeading", async () => {
    (dispatchBlockTool as unknown as Mock).mockResolvedValueOnce({
      blockId: "01FAKEBLOCK000000000000000",
    });
    const kit = buildBriefingToolKit({
      scope: ownerScope,
      briefId,
      sessionId,
    });
    const tool = kit[DefaultToolName.AppendHeading];
    const out = await tool.execute!({ content: { level: 1, text: "Hello" } }, {
      toolCallId: "tc-1",
      messages: [],
    } as any);
    expect(out).toEqual({ blockId: "01FAKEBLOCK000000000000000" });
    expect(dispatchBlockTool).toHaveBeenCalledWith({
      name: DefaultToolName.AppendHeading,
      scope: ownerScope,
      args: expect.objectContaining({
        briefId,
        content: { level: 1, text: "Hello" },
      }),
    });
    const callEvents = recordedEnvelopes.filter(
      (e) => e.event === "brief_block_tool_call",
    );
    expect(callEvents).toHaveLength(1);
    expect(callEvents[0].payload).toMatchObject({
      tool: DefaultToolName.AppendHeading,
      briefId,
    });
  });

  it("strips briefId from the model-visible schema for append tools", () => {
    const kit = buildBriefingToolKit({
      scope: ownerScope,
      briefId,
      sessionId,
    });
    const tool = kit[DefaultToolName.AppendParagraph];
    const schema = tool.inputSchema as {
      shape?: Record<string, unknown>;
    };
    if (schema.shape) {
      expect(schema.shape).not.toHaveProperty("briefId");
      expect(schema.shape).toHaveProperty("content");
    }
  });

  it("keeps blockId-scoped tools' schemas intact (no briefId injected)", async () => {
    (dispatchBlockTool as unknown as Mock).mockResolvedValueOnce({
      blockId: "01FAKE00000000000000000000",
      removed: true,
    });
    const kit = buildBriefingToolKit({
      scope: ownerScope,
      briefId,
      sessionId,
    });
    const tool = kit[DefaultToolName.RemoveBlock];
    const input = { blockId: "01FAKE00000000000000000000" };
    await tool.execute!(input, { toolCallId: "tc-2", messages: [] } as any);
    expect(dispatchBlockTool).toHaveBeenCalledWith({
      name: DefaultToolName.RemoveBlock,
      scope: ownerScope,
      args: input,
    });
  });

  it("emits brief_block_tool_rejected on AccessDeniedError and returns a structured error", async () => {
    (dispatchBlockTool as unknown as Mock).mockRejectedValueOnce(
      new AccessDeniedError("block.getById: user does not own this brief"),
    );
    const kit = buildBriefingToolKit({
      scope: ownerScope,
      briefId,
      sessionId,
    });
    const tool = kit[DefaultToolName.UpdateBlock];
    const out = await tool.execute!(
      { blockId: "01OTHER0000000000000000000", content: { text: "x" } },
      { toolCallId: "tc-3", messages: [] } as any,
    );
    expect(out).toMatchObject({ error: "access_denied" });
    const rejectedEvents = recordedEnvelopes.filter(
      (e) => e.event === "brief_block_tool_rejected",
    );
    expect(rejectedEvents).toHaveLength(1);
    expect(rejectedEvents[0].payload).toMatchObject({
      tool: DefaultToolName.UpdateBlock,
      briefId,
      reason: "access_denied",
    });
  });

  it("emits brief_block_tool_rejected on invalid input", async () => {
    (dispatchBlockTool as unknown as Mock).mockImplementationOnce(async () => {
      // The wrapper parses the full object via Zod inside the
      // dispatcher, so we emulate a ZodError bubbling up.
      const { z } = await import("zod");
      z.string().uuid().parse("not-a-uuid");
      return {};
    });
    const kit = buildBriefingToolKit({
      scope: ownerScope,
      briefId,
      sessionId,
    });
    const tool = kit[DefaultToolName.AppendHeading];
    const out = await tool.execute!({ content: { level: 1, text: "Hi" } }, {
      toolCallId: "tc-4",
      messages: [],
    } as any);
    expect(out).toMatchObject({ error: "invalid_input" });
    const rejectedEvents = recordedEnvelopes.filter(
      (e) => e.event === "brief_block_tool_rejected",
    );
    expect(rejectedEvents).toHaveLength(1);
    expect(rejectedEvents[0].payload).toMatchObject({
      tool: DefaultToolName.AppendHeading,
      briefId,
      reason: "invalid_input",
    });
  });
});

// NOTE: the registration-contract test (that `APP_DEFAULT_TOOL_KIT[briefing]`
// stays empty) was split into a dedicated file —
// `tool-kit.briefing-contract.test.ts` — so it can dynamic-import the heavy
// `tool-kit.ts` module graph (Canvas, Research, Passport, KB, pg/drizzle)
// without sharing module-load budget with the per-request factory tests
// above. See that file for the check.
