// ---------------------------------------------------------------------------
// Agent block tools + dispatcher (Phase 2a.1 — Block Types Spec §4,
// Architecture Rule 13).
//
// The dispatcher maps tool names from `DefaultToolName` (the authoritative
// per-type verbs) to `pgBlockRepository` operations. Unknown tool names
// are rejected; there is NO silent fallback ("no silent fallback" —
// Block Types Spec §4).
//
// Tools themselves are declared with `ai`'s `tool()` helper so they can
// be plugged into the chat runtime. This phase ships the tools as
// SCHEMA + HANDLERS — the chat route wires them up in a subsequent PR
// when the briefing toolkit is opted into. The dispatcher is the
// integration seam the dispatcher test hammers.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { pgBlockRepository } from "@/lib/db/pg/repositories/block-repository.pg";
import { AtlasBlocksTable } from "@/lib/db/pg/schema.pg";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { and, asc, eq, gt } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { DefaultToolName } from "@/lib/ai/tools";
import type { AccessScope } from "@/lib/db/pg/repositories/access-scope";

// ---------------------------------------------------------------------------
// Zod input schemas — shared by the tool declarations AND the dispatcher
// test. The schemas are the contract the model sees, so changes here
// must be reflected in docs/phase-2a1-report.md.
// ---------------------------------------------------------------------------

const HeadingContent = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().max(200),
});

const ParagraphMark = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    type: z.enum(["bold", "italic", "code", "link"]),
    url: z.string().optional(),
  })
  .refine((m) => m.start < m.end, {
    message: "mark start must be < end",
  })
  .refine(
    (m) =>
      m.type === "link"
        ? typeof m.url === "string" && m.url.length > 0
        : m.url === undefined,
    { message: "url is required for link marks and forbidden otherwise" },
  );

const ParagraphContent = z.object({
  text: z.string().max(10_000),
  inline_formatting: z.array(ParagraphMark).optional(),
});

const BulletsContent = z.object({
  style: z.enum(["bullet", "numbered"]),
  items: z.array(z.string().max(10_000)).max(50),
  indent: z.array(z.number().int().min(0).max(2)).optional(),
});

export const AppendHeadingInput = z.object({
  briefId: z.string().uuid(),
  content: HeadingContent,
  afterBlockId: z.string().length(26).nullable().optional(),
});

export const AppendParagraphInput = z.object({
  briefId: z.string().uuid(),
  content: ParagraphContent,
  afterBlockId: z.string().length(26).nullable().optional(),
});

export const AppendBulletsInput = z.object({
  briefId: z.string().uuid(),
  content: BulletsContent,
  afterBlockId: z.string().length(26).nullable().optional(),
});

// Phase 3b — landscape-embed block (Brief-First Rebuild §5.3 /
// `docs/phase-3b-execution-prompt.md` line 39).
const LandscapeEmbedContent = z
  .object({
    query: z.string().max(400).optional(),
    layout: z.enum(["web", "umap", "rings"]),
    lens: z.string().max(64).optional(),
    schema_version: z.literal(1).default(1),
  })
  .refine((c) => c.layout !== "web" || (c.query && c.query.trim().length > 0), {
    message: "web layout requires a non-empty query",
  })
  .refine(
    (c) => c.layout !== "rings" || (c.query && c.query.trim().length > 0),
    { message: "rings layout requires a non-empty query" },
  );

export const AppendLandscapeEmbedInput = z.object({
  briefId: z.string().uuid(),
  content: LandscapeEmbedContent,
  afterBlockId: z.string().length(26).nullable().optional(),
});

export const UpdateBlockInput = z.object({
  blockId: z.string().length(26),
  content: z.unknown(),
});

export const RemoveBlockInput = z.object({
  blockId: z.string().length(26),
});

export const DuplicateBlockInput = z.object({
  blockId: z.string().length(26),
});

export const MoveBlockInput = z.object({
  blockId: z.string().length(26),
  newIndex: z.number().int().nonnegative(),
});

export const GetBriefInput = z.object({
  briefId: z.string().uuid(),
});

export const ChangeHeadingLevelInput = z.object({
  blockId: z.string().length(26),
  newLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const ConvertBulletsStyleInput = z.object({
  blockId: z.string().length(26),
});

// ---------------------------------------------------------------------------
// Dispatcher — called from a tool `execute` or from the chat route
// wrapper with the resolved owner scope + validated args. The union of
// tool names is enumerated once so adding a tool requires updating this
// switch (and the dispatcher test will fail fast if you forget).
//
// No silent fallback: an unknown tool name throws `UnknownBlockToolError`.
// ---------------------------------------------------------------------------

export class UnknownBlockToolError extends Error {
  readonly code = "unknown_block_tool" as const;
  constructor(name: string) {
    super(`unknown block tool: ${name}`);
    this.name = "UnknownBlockToolError";
  }
}

async function nextPositionAfter(
  briefId: string,
  afterPos: string,
): Promise<string | null> {
  const rows = await db
    .select({ position: AtlasBlocksTable.position })
    .from(AtlasBlocksTable)
    .where(
      and(
        eq(AtlasBlocksTable.briefId, briefId),
        gt(AtlasBlocksTable.position, afterPos),
      ),
    )
    .orderBy(asc(AtlasBlocksTable.position))
    .limit(1);
  return rows[0]?.position ?? null;
}

async function computeAppendPosition(
  briefId: string,
  afterBlockId: string | null | undefined,
  scope: AccessScope,
): Promise<string | undefined> {
  if (!afterBlockId) return undefined;
  const ref = await pgBlockRepository.getById(afterBlockId, scope);
  if (!ref) throw new Error("afterBlockId not found");
  const next = await nextPositionAfter(briefId, ref.position);
  return generateKeyBetween(ref.position, next);
}

export interface DispatchArgs {
  name: string;
  args: unknown;
  scope: AccessScope;
  /** Brief id required for update / remove / duplicate / move; derived
   *  from the block row when the tool takes a blockId rather than a
   *  briefId. */
  briefIdHint?: string;
}

export async function dispatchBlockTool({ name, args, scope }: DispatchArgs) {
  switch (name) {
    case DefaultToolName.AppendHeading: {
      const parsed = AppendHeadingInput.parse(args);
      const position = await computeAppendPosition(
        parsed.briefId,
        parsed.afterBlockId,
        scope,
      );
      const row = await pgBlockRepository.create(
        {
          briefId: parsed.briefId,
          type: "heading",
          contentJson: parsed.content,
          source: "agent",
          ...(position !== undefined ? { position } : {}),
        },
        scope,
      );
      return { blockId: row.id };
    }
    case DefaultToolName.AppendParagraph: {
      const parsed = AppendParagraphInput.parse(args);
      const position = await computeAppendPosition(
        parsed.briefId,
        parsed.afterBlockId,
        scope,
      );
      const row = await pgBlockRepository.create(
        {
          briefId: parsed.briefId,
          type: "paragraph",
          contentJson: parsed.content,
          source: "agent",
          ...(position !== undefined ? { position } : {}),
        },
        scope,
      );
      return { blockId: row.id };
    }
    case DefaultToolName.AppendBullets: {
      const parsed = AppendBulletsInput.parse(args);
      const position = await computeAppendPosition(
        parsed.briefId,
        parsed.afterBlockId,
        scope,
      );
      const row = await pgBlockRepository.create(
        {
          briefId: parsed.briefId,
          type: "bullets",
          contentJson: parsed.content,
          source: "agent",
          ...(position !== undefined ? { position } : {}),
        },
        scope,
      );
      return { blockId: row.id };
    }
    case DefaultToolName.AppendLandscapeEmbed: {
      const parsed = AppendLandscapeEmbedInput.parse(args);
      const position = await computeAppendPosition(
        parsed.briefId,
        parsed.afterBlockId,
        scope,
      );
      const row = await pgBlockRepository.create(
        {
          briefId: parsed.briefId,
          type: "landscape-embed",
          contentJson: {
            ...parsed.content,
            schema_version: 1,
          },
          source: "agent",
          ...(position !== undefined ? { position } : {}),
        },
        scope,
      );
      return { blockId: row.id };
    }
    case DefaultToolName.UpdateBlock: {
      const parsed = UpdateBlockInput.parse(args);
      const row = await pgBlockRepository.update(
        parsed.blockId,
        { contentJson: parsed.content },
        scope,
      );
      return { blockId: row.id };
    }
    case DefaultToolName.RemoveBlock: {
      const parsed = RemoveBlockInput.parse(args);
      await pgBlockRepository.delete(parsed.blockId, scope);
      return { blockId: parsed.blockId, removed: true as const };
    }
    case DefaultToolName.DuplicateBlock: {
      const parsed = DuplicateBlockInput.parse(args);
      const src = await pgBlockRepository.getById(parsed.blockId, scope);
      if (!src) throw new Error("duplicate: block not found");
      const next = await nextPositionAfter(src.briefId, src.position);
      const position = generateKeyBetween(src.position, next);
      const row = await pgBlockRepository.create(
        {
          briefId: src.briefId,
          type: src.type as never,
          contentJson: src.contentJson,
          source: "agent",
          position,
        },
        scope,
      );
      return { blockId: row.id };
    }
    case DefaultToolName.MoveBlock: {
      const parsed = MoveBlockInput.parse(args);
      const src = await pgBlockRepository.getById(parsed.blockId, scope);
      if (!src) throw new Error("move: block not found");
      const all = await pgBlockRepository.listByBrief(src.briefId, scope);
      const without = all.filter((b) => b.id !== parsed.blockId);
      const idx = Math.min(parsed.newIndex, without.length);
      const before = idx === 0 ? null : without[idx - 1].position;
      const after = idx >= without.length ? null : without[idx].position;
      const newPosition = generateKeyBetween(before, after);
      const row = await pgBlockRepository.move(
        parsed.blockId,
        newPosition,
        scope,
      );
      return { blockId: row.id, newIndex: idx };
    }
    case DefaultToolName.GetBrief: {
      const parsed = GetBriefInput.parse(args);
      const rows = await pgBlockRepository.listByBrief(parsed.briefId, scope);
      return {
        briefId: parsed.briefId,
        blocks: rows.map((r) => ({
          id: r.id,
          type: r.type,
          position: r.position,
          content: r.contentJson,
          source: r.source,
        })),
      };
    }
    case DefaultToolName.ChangeHeadingLevel: {
      const parsed = ChangeHeadingLevelInput.parse(args);
      const src = await pgBlockRepository.getById(parsed.blockId, scope);
      if (!src || src.type !== "heading") {
        throw new Error("changeHeadingLevel: block is not a heading");
      }
      const prev = (src.contentJson ?? {}) as { text?: string };
      const row = await pgBlockRepository.update(
        parsed.blockId,
        { contentJson: { level: parsed.newLevel, text: prev.text ?? "" } },
        scope,
      );
      return { blockId: row.id };
    }
    case DefaultToolName.ConvertBulletsStyle: {
      const parsed = ConvertBulletsStyleInput.parse(args);
      const src = await pgBlockRepository.getById(parsed.blockId, scope);
      if (!src || src.type !== "bullets") {
        throw new Error("convertBulletsStyle: block is not a bullets block");
      }
      const prev = (src.contentJson ?? {}) as {
        style?: "bullet" | "numbered";
        items?: string[];
        indent?: number[];
      };
      const nextStyle = prev.style === "numbered" ? "bullet" : "numbered";
      const row = await pgBlockRepository.update(
        parsed.blockId,
        { contentJson: { ...prev, style: nextStyle } },
        scope,
      );
      return { blockId: row.id };
    }
    default:
      throw new UnknownBlockToolError(name);
  }
}

// ---------------------------------------------------------------------------
// Tool descriptor registry.
//
// Phase 2a.1 exposes the dispatcher (`dispatchBlockTool`) as the single
// public seam for agent-driven block writes. The briefing chat route
// binds each `DefaultToolName` to a tool() descriptor at the call site
// — dispatch is performed by the dispatcher above with the owner scope
// the route resolves from the session. Keeping the descriptor SCHEMAS
// here (without AI SDK `tool()` wrappers) means the toolkit can be
// wired up from either the chat route or from a future server-side
// workflow without double-declaring the shape.
// ---------------------------------------------------------------------------

export const BLOCK_TOOL_SCHEMAS = {
  [DefaultToolName.AppendHeading]: {
    description: "Append a heading block to a brief.",
    inputSchema: AppendHeadingInput,
  },
  [DefaultToolName.AppendParagraph]: {
    description: "Append a paragraph block to a brief.",
    inputSchema: AppendParagraphInput,
  },
  [DefaultToolName.AppendBullets]: {
    description: "Append a bullets block to a brief.",
    inputSchema: AppendBulletsInput,
  },
  [DefaultToolName.AppendLandscapeEmbed]: {
    description:
      "Append a landscape-embed block to a brief. Embeds the Atlas force-graph lens as a live artefact. `content.query` is an optional gravity query (required if layout is 'web' or 'rings'); `content.layout` selects the POC layout (web = physics, umap = explore, rings = top-K concentric).",
    inputSchema: AppendLandscapeEmbedInput,
  },
  [DefaultToolName.UpdateBlock]: {
    description: "Update the content_json of an existing block.",
    inputSchema: UpdateBlockInput,
  },
  [DefaultToolName.RemoveBlock]: {
    description: "Remove a block from its brief.",
    inputSchema: RemoveBlockInput,
  },
  [DefaultToolName.DuplicateBlock]: {
    description: "Create a sibling copy of a block immediately after it.",
    inputSchema: DuplicateBlockInput,
  },
  [DefaultToolName.MoveBlock]: {
    description: "Move a block to a new top-level index within its brief.",
    inputSchema: MoveBlockInput,
  },
  [DefaultToolName.GetBrief]: {
    description: "Return the ordered list of blocks for a brief.",
    inputSchema: GetBriefInput,
  },
  [DefaultToolName.ChangeHeadingLevel]: {
    description: "Change a heading block's level (1, 2, or 3).",
    inputSchema: ChangeHeadingLevelInput,
  },
  [DefaultToolName.ConvertBulletsStyle]: {
    description: "Toggle a bullets block between unordered and ordered.",
    inputSchema: ConvertBulletsStyleInput,
  },
} as const;
