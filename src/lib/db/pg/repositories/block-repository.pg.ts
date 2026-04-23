// ---------------------------------------------------------------------------
// Block repository (Phase 2a.0, Brief-First Rebuild — Data Model Spec
// §4.2, Block Types Spec §1, Access-control §7.2).
//
// CRUD against `atlas.blocks`, gated by the `AccessScope` contract. No
// Postgres RLS — permit/deny is enforced here and every deny path
// throws `AccessDeniedError`.
//
// Phase-2a.0 semantics
// --------------------
// * `listByBrief(briefId, scope)` / `getById(id, scope)` — follow the
//   parent brief's read permission. Owner under a user scope, or an
//   active share-token scope on the parent brief. System scope is
//   denied (blocks are user-facing content).
// * `create` / `update` / `delete` / `move` — owner-only writes. Share
//   scope is read-only in v1; any write with `scope.kind === 'share'`
//   throws `AccessDeniedError`. Mirrors message-repository.pg.ts.
//
// Position generation
// -------------------
// Callers may pass an explicit `position` computed from `fractional-
// indexing`'s `generateKeyBetween(a, b)`. When `create` is called
// without a `position`, it defaults to an append-to-end key —
// `generateKeyBetween(lastExistingKey, null)` — which keeps the Phase
// 2a.0 seed / test surface simple. `move` is the only explicit reorder
// verb; callers compute `newPosition` themselves.
//
// ULIDs
// -----
// Each repository module holds a shared monotonic ULID factory
// (Spec §3). Callers MAY pass an `id` to `create`; when omitted the
// factory generates a fresh 26-char ULID.
// ---------------------------------------------------------------------------

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { monotonicFactory } from "ulid";
import { pgDb as db } from "../db.pg";
import {
  AtlasBlocksTable,
  AtlasBriefShareTokensTable,
  AtlasBriefsTable,
  type AtlasBlockEntity,
} from "../schema.pg";
import { AccessDeniedError, type AccessScope } from "./access-scope";

export type BlockType =
  | "heading"
  | "paragraph"
  | "bullets"
  | "citation"
  | "project-card"
  | "chart"
  | "live-passport-view"
  | "landscape-embed"
  | "table";

export type BlockSource = "user" | "agent";

export interface AtlasBlockCreateInput {
  briefId: string;
  type: BlockType;
  /** Optional. Append-to-end when omitted. */
  position?: string;
  contentJson: unknown;
  source: BlockSource;
  /** Optional client-generated 26-char ULID. */
  id?: string;
}

export interface AtlasBlockUpdateInput {
  contentJson?: unknown;
}

export interface BlockRepository {
  create(
    input: AtlasBlockCreateInput,
    scope: AccessScope,
  ): Promise<AtlasBlockEntity>;
  getById(
    id: string,
    scope: AccessScope,
  ): Promise<AtlasBlockEntity | null>;
  listByBrief(
    briefId: string,
    scope: AccessScope,
  ): Promise<AtlasBlockEntity[]>;
  update(
    id: string,
    patch: AtlasBlockUpdateInput,
    scope: AccessScope,
  ): Promise<AtlasBlockEntity>;
  delete(id: string, scope: AccessScope): Promise<void>;
  move(
    id: string,
    newPosition: string,
    scope: AccessScope,
  ): Promise<AtlasBlockEntity>;
}

const nextUlid = monotonicFactory();

async function briefOwnerId(briefId: string): Promise<string | null> {
  const rows = await db
    .select({ ownerId: AtlasBriefsTable.ownerId })
    .from(AtlasBriefsTable)
    .where(eq(AtlasBriefsTable.id, briefId))
    .limit(1);
  return rows[0]?.ownerId ?? null;
}

async function isActiveShareForBrief(
  briefId: string,
  token: string,
): Promise<boolean> {
  const rows = await db
    .select({
      id: AtlasBriefShareTokensTable.id,
      expiresAt: AtlasBriefShareTokensTable.expiresAt,
    })
    .from(AtlasBriefShareTokensTable)
    .where(
      and(
        eq(AtlasBriefShareTokensTable.briefId, briefId),
        eq(AtlasBriefShareTokensTable.token, token),
        isNull(AtlasBriefShareTokensTable.revokedAt),
      ),
    )
    .limit(1);
  if (rows.length === 0) return false;
  const exp = rows[0].expiresAt;
  if (exp === null) return true;
  return exp.getTime() > Date.now();
}

async function lastPositionForBrief(briefId: string): Promise<string | null> {
  const rows = await db
    .select({ position: AtlasBlocksTable.position })
    .from(AtlasBlocksTable)
    .where(eq(AtlasBlocksTable.briefId, briefId))
    .orderBy(desc(AtlasBlocksTable.position))
    .limit(1);
  return rows[0]?.position ?? null;
}

async function requireOwnerWriteOnBlock(
  blockId: string,
  scope: AccessScope,
  verb: string,
): Promise<{ briefId: string }> {
  if (scope.kind !== "user") {
    throw new AccessDeniedError(
      `${verb}: only user scope is permitted (share scope is read-only in v1; system scope is not a block author)`,
    );
  }
  const rows = await db
    .select({ briefId: AtlasBlocksTable.briefId })
    .from(AtlasBlocksTable)
    .where(eq(AtlasBlocksTable.id, blockId))
    .limit(1);
  if (rows.length === 0) {
    throw new AccessDeniedError(`${verb}: block not found`);
  }
  const ownerId = await briefOwnerId(rows[0].briefId);
  if (ownerId === null) {
    throw new AccessDeniedError(`${verb}: parent brief not found`);
  }
  if (ownerId !== scope.userId) {
    throw new AccessDeniedError(
      `${verb}: user does not own the parent brief`,
    );
  }
  return { briefId: rows[0].briefId };
}

async function requireBriefReadable(
  briefId: string,
  scope: AccessScope,
  verb: string,
): Promise<void> {
  if (scope.kind === "system") {
    throw new AccessDeniedError(
      `${verb}: system scope is not permitted for user-facing reads`,
    );
  }
  if (scope.kind === "user") {
    const ownerId = await briefOwnerId(briefId);
    if (ownerId === null) {
      throw new AccessDeniedError(`${verb}: brief not found`);
    }
    if (ownerId !== scope.userId) {
      throw new AccessDeniedError(`${verb}: user does not own this brief`);
    }
    return;
  }
  const permitted = await isActiveShareForBrief(briefId, scope.token);
  if (!permitted) {
    throw new AccessDeniedError(
      `${verb}: share token is invalid, expired, or revoked`,
    );
  }
}

export const pgBlockRepository: BlockRepository = {
  async create(input, scope) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "block.create: only user scope is permitted (share scope is read-only; system scope is not a block author)",
      );
    }
    const ownerId = await briefOwnerId(input.briefId);
    if (ownerId === null) {
      throw new AccessDeniedError("block.create: parent brief not found");
    }
    if (ownerId !== scope.userId) {
      throw new AccessDeniedError(
        "block.create: user does not own the parent brief",
      );
    }
    const position =
      input.position ??
      generateKeyBetween(await lastPositionForBrief(input.briefId), null);
    const id = input.id ?? nextUlid();
    const [row] = await db
      .insert(AtlasBlocksTable)
      .values({
        id,
        briefId: input.briefId,
        type: input.type,
        position,
        contentJson: input.contentJson as object,
        source: input.source,
      })
      .returning();
    return row;
  },

  async getById(id, scope) {
    if (scope.kind === "system") {
      throw new AccessDeniedError(
        "block.getById: system scope is not permitted for user-facing reads",
      );
    }
    const rows = await db
      .select()
      .from(AtlasBlocksTable)
      .where(eq(AtlasBlocksTable.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    await requireBriefReadable(row.briefId, scope, "block.getById");
    return row;
  },

  async listByBrief(briefId, scope) {
    await requireBriefReadable(briefId, scope, "block.listByBrief");
    const rows = await db
      .select()
      .from(AtlasBlocksTable)
      .where(eq(AtlasBlocksTable.briefId, briefId))
      .orderBy(asc(AtlasBlocksTable.position));
    return rows;
  },

  async update(id, patch, scope) {
    await requireOwnerWriteOnBlock(id, scope, "block.update");
    const [row] = await db
      .update(AtlasBlocksTable)
      .set({
        ...(patch.contentJson !== undefined
          ? { contentJson: patch.contentJson as object }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(AtlasBlocksTable.id, id))
      .returning();
    return row;
  },

  async delete(id, scope) {
    await requireOwnerWriteOnBlock(id, scope, "block.delete");
    await db.delete(AtlasBlocksTable).where(eq(AtlasBlocksTable.id, id));
  },

  async move(id, newPosition, scope) {
    await requireOwnerWriteOnBlock(id, scope, "block.move");
    const [row] = await db
      .update(AtlasBlocksTable)
      .set({ position: newPosition, updatedAt: new Date() })
      .where(eq(AtlasBlocksTable.id, id))
      .returning();
    return row;
  },
};
