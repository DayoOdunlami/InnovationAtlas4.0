// ---------------------------------------------------------------------------
// Brief repository (Phase 1, Brief-First Rebuild — Data Model Spec §4.1)
//
// CRUD against `atlas.briefs`, gated by the `AccessScope` contract declared
// in `./access-scope.ts`. No RLS: every method is responsible for its own
// permit/deny decision before touching the database.
//
// Phase-1 semantics
// -----------------
// * `createBrief`  — user scope only; `input.ownerId` must equal
//   `scope.userId`. Share and system scopes are denied.
// * `getBriefById` — user scope permits iff the row's `owner_id` matches.
//   share scope permits iff the token row matches `(briefId, token)` and
//   is unexpired + unrevoked.
// * `listBriefsForUser` — user scope, and `scope.userId === userId`.
//   Share scope has no list view in Phase 1; system scope is denied.
// * `updateBrief` / `deleteBrief` — owner-only writes. Share scope is
//   view-only in v1 (see Data Model Spec §13 Q1). Phase 1 is a hard
//   delete; `deleted_at` stays reserved for Phase 4.
//
// Every deny path raises `AccessDeniedError`; server actions and API
// routes translate that into a 403 / redirect. Tests co-located next to
// this file cover the full permit/deny matrix.
// ---------------------------------------------------------------------------

import { and, desc, eq, isNull } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  AtlasBriefShareTokensTable,
  AtlasBriefsTable,
  type AtlasBriefEntity,
} from "../schema.pg";
import { AccessDeniedError, type AccessScope } from "./access-scope";

export interface CreateBriefInput {
  ownerId: string;
  title?: string;
}

export interface UpdateBriefPatch {
  title?: string;
  agentCompleteSnapshotJson?: unknown;
  isEdited?: boolean;
}

export interface BriefRepository {
  createBrief(
    input: CreateBriefInput,
    scope: AccessScope,
  ): Promise<AtlasBriefEntity>;
  getBriefById(
    id: string,
    scope: AccessScope,
  ): Promise<AtlasBriefEntity | null>;
  listBriefsForUser(
    userId: string,
    scope: AccessScope,
  ): Promise<AtlasBriefEntity[]>;
  updateBrief(
    id: string,
    patch: UpdateBriefPatch,
    scope: AccessScope,
  ): Promise<AtlasBriefEntity>;
  deleteBrief(id: string, scope: AccessScope): Promise<void>;
}

async function readOwnerId(id: string): Promise<string | null> {
  const rows = await db
    .select({ ownerId: AtlasBriefsTable.ownerId })
    .from(AtlasBriefsTable)
    .where(eq(AtlasBriefsTable.id, id))
    .limit(1);
  return rows[0]?.ownerId ?? null;
}

async function isActiveShareForBrief(
  briefId: string,
  token: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: AtlasBriefShareTokensTable.id })
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
  // Expiry is compared in-app (expires_at IS NULL OR expires_at > now()).
  // The `.where` cast to SQL-expr would also work; keeping it explicit
  // here makes the permit check auditable in one glance.
  const tokenRow = await db
    .select({ expiresAt: AtlasBriefShareTokensTable.expiresAt })
    .from(AtlasBriefShareTokensTable)
    .where(eq(AtlasBriefShareTokensTable.id, rows[0].id))
    .limit(1);
  const exp = tokenRow[0]?.expiresAt ?? null;
  if (exp === null) return true;
  return exp.getTime() > Date.now();
}

export const pgBriefRepository: BriefRepository = {
  async createBrief(input, scope) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "createBrief requires a user scope (share and system scopes cannot create briefs)",
      );
    }
    if (input.ownerId !== scope.userId) {
      throw new AccessDeniedError(
        "createBrief: input.ownerId must equal scope.userId",
      );
    }
    const [row] = await db
      .insert(AtlasBriefsTable)
      .values({
        ownerId: input.ownerId,
        ...(input.title !== undefined ? { title: input.title } : {}),
      })
      .returning();
    return row;
  },

  async getBriefById(id, scope) {
    if (scope.kind === "system") {
      throw new AccessDeniedError(
        "getBriefById: system scope is not permitted for user-facing reads",
      );
    }
    if (scope.kind === "user") {
      const ownerId = await readOwnerId(id);
      if (ownerId === null) return null;
      if (ownerId !== scope.userId) {
        throw new AccessDeniedError(
          "getBriefById: user does not own this brief",
        );
      }
      const [row] = await db
        .select()
        .from(AtlasBriefsTable)
        .where(eq(AtlasBriefsTable.id, id))
        .limit(1);
      return row ?? null;
    }
    const permitted = await isActiveShareForBrief(id, scope.token);
    if (!permitted) {
      throw new AccessDeniedError(
        "getBriefById: share token is invalid, expired, or revoked",
      );
    }
    const [row] = await db
      .select()
      .from(AtlasBriefsTable)
      .where(eq(AtlasBriefsTable.id, id))
      .limit(1);
    return row ?? null;
  },

  async listBriefsForUser(userId, scope) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "listBriefsForUser: only user scope is permitted",
      );
    }
    if (scope.userId !== userId) {
      throw new AccessDeniedError(
        "listBriefsForUser: scope.userId must equal the requested userId",
      );
    }
    const rows = await db
      .select()
      .from(AtlasBriefsTable)
      .where(
        and(
          eq(AtlasBriefsTable.ownerId, userId),
          isNull(AtlasBriefsTable.deletedAt),
        ),
      )
      .orderBy(desc(AtlasBriefsTable.updatedAt));
    return rows;
  },

  async updateBrief(id, patch, scope) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "updateBrief: only user scope is permitted (share scope is view-only in v1)",
      );
    }
    const ownerId = await readOwnerId(id);
    if (ownerId === null) {
      throw new AccessDeniedError("updateBrief: brief not found");
    }
    if (ownerId !== scope.userId) {
      throw new AccessDeniedError("updateBrief: user does not own this brief");
    }
    const [row] = await db
      .update(AtlasBriefsTable)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.agentCompleteSnapshotJson !== undefined
          ? { agentCompleteSnapshotJson: patch.agentCompleteSnapshotJson }
          : {}),
        ...(patch.isEdited !== undefined ? { isEdited: patch.isEdited } : {}),
        updatedAt: new Date(),
      })
      .where(eq(AtlasBriefsTable.id, id))
      .returning();
    return row;
  },

  async deleteBrief(id, scope) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "deleteBrief: only user scope is permitted (share scope is view-only in v1)",
      );
    }
    const ownerId = await readOwnerId(id);
    if (ownerId === null) {
      throw new AccessDeniedError("deleteBrief: brief not found");
    }
    if (ownerId !== scope.userId) {
      throw new AccessDeniedError("deleteBrief: user does not own this brief");
    }
    await db.delete(AtlasBriefsTable).where(eq(AtlasBriefsTable.id, id));
  },
};
