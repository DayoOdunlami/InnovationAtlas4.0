"use server";

// Share-token + block-CRUD server actions for the /brief/[id] owner view.
//
// Phase 2a.1 adds per-type append, universal update / remove / duplicate /
// move, and type-specific verbs (changeHeadingLevel, convertBulletsStyle).
// Every write goes through `pgBlockRepository` under a user-scope (owner-
// only writes are enforced inside the repository). The actions also flip
// `atlas.briefs.is_edited` to TRUE the first time the owner edits a
// brief, per Phase 2a.1 telemetry §8.

import { pgBlockRepository } from "@/lib/db/pg/repositories/block-repository.pg";
import { pgBriefRepository } from "@/lib/db/pg/repositories/brief-repository.pg";
import { pgBriefShareTokenRepository } from "@/lib/db/pg/repositories/brief-share-token-repository.pg";
import { AtlasBlocksTable } from "@/lib/db/pg/schema.pg";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { emitAction } from "@/lib/telemetry/emit";
import type { TelemetryEnv } from "@/lib/telemetry/envelope";
import { and, asc, eq, gt } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { getSession } from "lib/auth/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const MintInput = z.object({ briefId: z.string().uuid() });
const RevokeInput = z.object({
  tokenId: z.string().uuid(),
  briefId: z.string().uuid(),
});

function resolveAppEnv(): TelemetryEnv {
  const raw = (process.env.APP_ENV ?? "").toLowerCase();
  if (raw === "prod" || raw === "production") return "prod";
  if (raw === "preview") return "preview";
  if (raw === "test") return "test";
  return "dev";
}

export async function mintBriefShareTokenAction(formData: FormData) {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const parsed = MintInput.parse({ briefId: formData.get("briefId") });
  const row = await pgBriefShareTokenRepository.mintToken(parsed.briefId, {
    kind: "user",
    userId,
  });
  await emitAction("brief_share_token_minted", {
    sessionId: session.session.id,
    userId,
    env: resolveAppEnv(),
    payload: { briefId: parsed.briefId, tokenId: row.id },
  });
  revalidatePath(`/brief/${parsed.briefId}`);
}

export async function revokeBriefShareTokenAction(formData: FormData) {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const parsed = RevokeInput.parse({
    tokenId: formData.get("tokenId"),
    briefId: formData.get("briefId"),
  });
  await pgBriefShareTokenRepository.revokeToken(parsed.tokenId, {
    kind: "user",
    userId,
  });
  revalidatePath(`/brief/${parsed.briefId}`);
}

// ---------------------------------------------------------------------------
// Phase 2a.1 — block CRUD server actions.
// ---------------------------------------------------------------------------

const HeadingContentSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().max(200),
});

const ParagraphMarkSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    type: z.enum(["bold", "italic", "code", "link"]),
    url: z.string().optional(),
  })
  .refine((m) => m.start < m.end, "mark start must be < end")
  .refine(
    (m) =>
      m.type === "link" ? typeof m.url === "string" : m.url === undefined,
    "url is required for link marks and forbidden otherwise",
  );

const ParagraphContentSchema = z.object({
  text: z.string().max(10_000),
  inline_formatting: z.array(ParagraphMarkSchema).optional(),
});

const BulletsContentSchema = z.object({
  style: z.enum(["bullet", "numbered"]),
  items: z.array(z.string().max(10_000)).max(50),
  indent: z.array(z.number().int().min(0).max(2)).optional(),
});

const BlockTypeSchema = z.enum([
  "heading",
  "paragraph",
  "bullets",
  "citation",
  "project-card",
  "chart",
  "live-passport-view",
  "landscape-embed",
  "table",
]);

type UserScope = { kind: "user"; userId: string };

async function requireUser(): Promise<{ userId: string; sessionId: string }> {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  return { userId: session.user.id, sessionId: session.session.id };
}

async function flipFirstEditIfNeeded(params: {
  briefId: string;
  scope: UserScope;
  sessionId: string;
}) {
  const { briefId, scope, sessionId } = params;
  const brief = await pgBriefRepository.getBriefById(briefId, scope);
  if (!brief || brief.isEdited) return;
  await pgBriefRepository.updateBrief(briefId, { isEdited: true }, scope);
  await emitAction("brief_first_edited", {
    sessionId,
    userId: scope.userId,
    env: resolveAppEnv(),
    payload: { briefId },
  });
}

// Finds the position of the sibling immediately after `afterBlockId`
// within the same brief, returning null when `afterBlockId` is the last
// block. Used to compute a fractional index strictly between the two.
async function nextBlockPositionAfter(
  briefId: string,
  afterPosition: string,
): Promise<string | null> {
  const rows = await db
    .select({ position: AtlasBlocksTable.position })
    .from(AtlasBlocksTable)
    .where(
      and(
        eq(AtlasBlocksTable.briefId, briefId),
        gt(AtlasBlocksTable.position, afterPosition),
      ),
    )
    .orderBy(asc(AtlasBlocksTable.position))
    .limit(1);
  return rows[0]?.position ?? null;
}

export interface AppendBlockInput {
  briefId: string;
  type: z.infer<typeof BlockTypeSchema>;
  contentJson: unknown;
  afterBlockId?: string | null;
  source?: "user" | "agent";
}

export async function appendBlockAction(input: AppendBlockInput) {
  const { userId, sessionId } = await requireUser();
  const scope: UserScope = { kind: "user", userId };
  const parsed = z
    .object({
      briefId: z.string().uuid(),
      type: BlockTypeSchema,
      contentJson: z.unknown(),
      afterBlockId: z.string().length(26).nullable().optional(),
      source: z.enum(["user", "agent"]).default("user"),
    })
    .parse(input);

  validateContent(parsed.type, parsed.contentJson);

  let position: string | undefined;
  if (parsed.afterBlockId) {
    const ref = await pgBlockRepository.getById(parsed.afterBlockId, scope);
    if (!ref) throw new Error("append: afterBlockId not found");
    const next = await nextBlockPositionAfter(parsed.briefId, ref.position);
    position = generateKeyBetween(ref.position, next);
  }

  const row = await pgBlockRepository.create(
    {
      briefId: parsed.briefId,
      type: parsed.type,
      contentJson: parsed.contentJson,
      source: parsed.source,
      ...(position !== undefined ? { position } : {}),
    },
    scope,
  );

  await flipFirstEditIfNeeded({ briefId: parsed.briefId, scope, sessionId });
  await emitAction("brief_block_appended", {
    sessionId,
    userId,
    env: resolveAppEnv(),
    payload: {
      briefId: parsed.briefId,
      blockId: row.id,
      type: parsed.type,
      source: parsed.source,
    },
  });
  revalidatePath(`/brief/${parsed.briefId}`);
  return row;
}

export interface UpdateBlockInput {
  briefId: string;
  blockId: string;
  contentJson: unknown;
}

export async function updateBlockAction(input: UpdateBlockInput) {
  const { userId, sessionId } = await requireUser();
  const scope: UserScope = { kind: "user", userId };
  const parsed = z
    .object({
      briefId: z.string().uuid(),
      blockId: z.string().length(26),
      contentJson: z.unknown(),
    })
    .parse(input);

  const existing = await pgBlockRepository.getById(parsed.blockId, scope);
  if (!existing) throw new Error("update: block not found");
  validateContent(
    existing.type as z.infer<typeof BlockTypeSchema>,
    parsed.contentJson,
  );

  const row = await pgBlockRepository.update(
    parsed.blockId,
    { contentJson: parsed.contentJson },
    scope,
  );
  await flipFirstEditIfNeeded({ briefId: parsed.briefId, scope, sessionId });
  await emitAction("brief_block_updated", {
    sessionId,
    userId,
    env: resolveAppEnv(),
    payload: {
      briefId: parsed.briefId,
      blockId: parsed.blockId,
      type: existing.type,
    },
  });
  return row;
}

export interface RemoveBlockInput {
  briefId: string;
  blockId: string;
}

export async function removeBlockAction(input: RemoveBlockInput) {
  const { userId, sessionId } = await requireUser();
  const scope: UserScope = { kind: "user", userId };
  const parsed = z
    .object({
      briefId: z.string().uuid(),
      blockId: z.string().length(26),
    })
    .parse(input);

  await pgBlockRepository.delete(parsed.blockId, scope);
  await flipFirstEditIfNeeded({ briefId: parsed.briefId, scope, sessionId });
  await emitAction("brief_block_removed", {
    sessionId,
    userId,
    env: resolveAppEnv(),
    payload: { briefId: parsed.briefId, blockId: parsed.blockId },
  });
  revalidatePath(`/brief/${parsed.briefId}`);
}

export async function duplicateBlockAction(input: RemoveBlockInput) {
  const { userId, sessionId } = await requireUser();
  const scope: UserScope = { kind: "user", userId };
  const parsed = z
    .object({
      briefId: z.string().uuid(),
      blockId: z.string().length(26),
    })
    .parse(input);

  const src = await pgBlockRepository.getById(parsed.blockId, scope);
  if (!src) throw new Error("duplicate: block not found");
  const next = await nextBlockPositionAfter(parsed.briefId, src.position);
  const position = generateKeyBetween(src.position, next);
  const row = await pgBlockRepository.create(
    {
      briefId: parsed.briefId,
      type: src.type as never,
      contentJson: src.contentJson,
      source: "user",
      position,
    },
    scope,
  );
  await flipFirstEditIfNeeded({ briefId: parsed.briefId, scope, sessionId });
  await emitAction("brief_block_appended", {
    sessionId,
    userId,
    env: resolveAppEnv(),
    payload: {
      briefId: parsed.briefId,
      blockId: row.id,
      type: src.type,
      source: "user",
      duplicatedFrom: src.id,
    },
  });
  revalidatePath(`/brief/${parsed.briefId}`);
  return row;
}

export interface MoveBlockInput {
  briefId: string;
  blockId: string;
  /** Target top-level index in the brief's block list (0-based). */
  newIndex: number;
}

export async function moveBlockAction(input: MoveBlockInput) {
  const { userId, sessionId } = await requireUser();
  const scope: UserScope = { kind: "user", userId };
  const parsed = z
    .object({
      briefId: z.string().uuid(),
      blockId: z.string().length(26),
      newIndex: z.number().int().nonnegative(),
    })
    .parse(input);

  const all = await pgBlockRepository.listByBrief(parsed.briefId, scope);
  const without = all.filter((b) => b.id !== parsed.blockId);
  const clampIdx = Math.min(parsed.newIndex, without.length);
  const before = clampIdx === 0 ? null : without[clampIdx - 1].position;
  const after = clampIdx >= without.length ? null : without[clampIdx].position;
  const newPosition = generateKeyBetween(before, after);

  const row = await pgBlockRepository.move(parsed.blockId, newPosition, scope);
  await flipFirstEditIfNeeded({ briefId: parsed.briefId, scope, sessionId });
  await emitAction("brief_block_moved", {
    sessionId,
    userId,
    env: resolveAppEnv(),
    payload: {
      briefId: parsed.briefId,
      blockId: parsed.blockId,
      newIndex: clampIdx,
    },
  });
  revalidatePath(`/brief/${parsed.briefId}`);
  return row;
}

export interface ChangeHeadingLevelInput {
  briefId: string;
  blockId: string;
  newLevel: 1 | 2 | 3;
}

export async function changeHeadingLevelAction(input: ChangeHeadingLevelInput) {
  const { userId, sessionId } = await requireUser();
  const scope: UserScope = { kind: "user", userId };
  const parsed = z
    .object({
      briefId: z.string().uuid(),
      blockId: z.string().length(26),
      newLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    })
    .parse(input);

  const existing = await pgBlockRepository.getById(parsed.blockId, scope);
  if (!existing || existing.type !== "heading") {
    throw new Error("changeHeadingLevel: block is not a heading");
  }
  const content = (existing.contentJson ?? {}) as { text?: string };
  const newContent = { level: parsed.newLevel, text: content.text ?? "" };
  const row = await pgBlockRepository.update(
    parsed.blockId,
    { contentJson: newContent },
    scope,
  );
  await flipFirstEditIfNeeded({ briefId: parsed.briefId, scope, sessionId });
  await emitAction("brief_block_updated", {
    sessionId,
    userId,
    env: resolveAppEnv(),
    payload: {
      briefId: parsed.briefId,
      blockId: parsed.blockId,
      type: "heading",
      field: "level",
    },
  });
  return row;
}

export interface ConvertBulletsStyleInput {
  briefId: string;
  blockId: string;
}

export async function convertBulletsStyleAction(
  input: ConvertBulletsStyleInput,
) {
  const { userId, sessionId } = await requireUser();
  const scope: UserScope = { kind: "user", userId };
  const parsed = z
    .object({
      briefId: z.string().uuid(),
      blockId: z.string().length(26),
    })
    .parse(input);

  const existing = await pgBlockRepository.getById(parsed.blockId, scope);
  if (!existing || existing.type !== "bullets") {
    throw new Error("convertBulletsStyle: block is not a bullets block");
  }
  const content = (existing.contentJson ?? {}) as {
    style?: "bullet" | "numbered";
    items?: string[];
    indent?: number[];
  };
  const nextStyle = content.style === "numbered" ? "bullet" : "numbered";
  const newContent = { ...content, style: nextStyle };
  const row = await pgBlockRepository.update(
    parsed.blockId,
    { contentJson: newContent },
    scope,
  );
  await flipFirstEditIfNeeded({ briefId: parsed.briefId, scope, sessionId });
  await emitAction("brief_block_updated", {
    sessionId,
    userId,
    env: resolveAppEnv(),
    payload: {
      briefId: parsed.briefId,
      blockId: parsed.blockId,
      type: "bullets",
      field: "style",
    },
  });
  return row;
}

function validateContent(
  type: z.infer<typeof BlockTypeSchema>,
  content: unknown,
): void {
  if (type === "heading") HeadingContentSchema.parse(content);
  else if (type === "paragraph") ParagraphContentSchema.parse(content);
  else if (type === "bullets") BulletsContentSchema.parse(content);
  // Other block types are write-agnostic in 2a.1 (no editing UX yet);
  // content validation ships with their renderer in 2b / 3a.
}

// ---------------------------------------------------------------------------
// Phase 3a — appendLivePassportViewAction
//
// Owner-only server action that creates a `live-passport-view` block.
// Mirrors `appendBlockAction` for the specific content_json shape:
//   { passportId: string, schema_version: 1 }
//
// Telemetry: reuses the existing `brief_block_appended` envelope with
// `{ type: "live-passport-view" }` payload.
// ---------------------------------------------------------------------------

const AppendLivePassportViewSchema = z.object({
  briefId: z.string().uuid(),
  passportId: z.string().uuid(),
  afterBlockId: z.string().length(26).nullable().optional(),
});

export type AppendLivePassportViewInput = z.infer<
  typeof AppendLivePassportViewSchema
>;

export async function appendLivePassportViewAction(
  input: AppendLivePassportViewInput,
) {
  const { userId, sessionId } = await requireUser();
  const scope: UserScope = { kind: "user", userId };
  const parsed = AppendLivePassportViewSchema.parse(input);

  let position: string | undefined;
  if (parsed.afterBlockId) {
    const ref = await pgBlockRepository.getById(parsed.afterBlockId, scope);
    if (!ref) throw new Error("appendLivePassportView: afterBlockId not found");
    const next = await nextBlockPositionAfter(parsed.briefId, ref.position);
    position = generateKeyBetween(ref.position, next);
  }

  const contentJson = {
    passportId: parsed.passportId,
    schema_version: 1 as const,
  };

  const row = await pgBlockRepository.create(
    {
      briefId: parsed.briefId,
      type: "live-passport-view",
      contentJson,
      source: "user",
      ...(position !== undefined ? { position } : {}),
    },
    scope,
  );

  await flipFirstEditIfNeeded({ briefId: parsed.briefId, scope, sessionId });
  await emitAction("brief_block_appended", {
    sessionId,
    userId,
    env: resolveAppEnv(),
    payload: {
      briefId: parsed.briefId,
      blockId: row.id,
      type: "live-passport-view",
      source: "user",
    },
  });
  revalidatePath(`/brief/${parsed.briefId}`);
  return row;
}
