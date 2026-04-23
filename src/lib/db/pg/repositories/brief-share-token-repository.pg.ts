// ---------------------------------------------------------------------------
// Brief share-token repository (Phase 1, Brief-First Rebuild — Data Model
// Spec §4.5). Thin wrapper that enforces the `AccessScope` contract on
// top of atlas.brief_share_tokens.
//
// Phase-1 surface
// ---------------
// * `mintToken(briefId, scope)` — user scope only; user must own the
//   brief. Generates a cryptographically random token and returns the
//   row.
// * `listTokensForBrief(briefId, scope)` — user scope only; user must
//   own the brief.
// * `revokeToken(tokenId, scope)` — user scope only; user must own the
//   brief that the token belongs to.
// * `findActiveByToken(token)` — internal helper used by other
//   repositories (e.g. message-repository, brief-repository) to verify
//   a share-scope caller. No AccessScope param because it is not a
//   user-facing entry point.
//
// Share-token validity semantics (expiry + revocation) mirror the ones
// enforced in brief-repository.getBriefById; this module is the single
// place to add or update that logic in later phases.
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { serverCache } from "@/lib/cache";
import { pgDb as db } from "../db.pg";
import {
  AtlasBriefShareTokensTable,
  AtlasBriefsTable,
  type AtlasBriefShareTokenEntity,
} from "../schema.pg";
import { AccessDeniedError, type AccessScope } from "./access-scope";

// Rec 2 (Phase 2a.0 caching calibration): a short-TTL cache on the
// active-token lookup collapses ~72 ms (pure RTT) to <5 ms for the
// second hit. The cache key is a SHA-256 prefix of the token so the
// raw token never lands in memory as a cache key; mint/revoke paths
// invalidate explicitly. See docs/phase-1-caching-calibration.md §Rec 2.
const SHARE_TOKEN_CACHE_TTL_MS = 60_000;

function shareTokenCacheKey(token: string): string {
  const hash = createHash("sha256").update(token).digest("hex").slice(0, 32);
  return `atlas.share-token:${hash}`;
}

/**
 * Shape of the cached token row. Drizzle returns `Date` objects; to
 * survive a serialising cache backend (e.g. redis) we store the numeric
 * timestamps and rehydrate on read.
 */
interface CachedShareTokenRow {
  id: string;
  briefId: string;
  token: string;
  createdAtMs: number;
  expiresAtMs: number | null;
  revokedAtMs: number | null;
}

function toCached(row: AtlasBriefShareTokenEntity): CachedShareTokenRow {
  return {
    id: row.id,
    briefId: row.briefId,
    token: row.token,
    createdAtMs: row.createdAt.getTime(),
    expiresAtMs: row.expiresAt?.getTime() ?? null,
    revokedAtMs: row.revokedAt?.getTime() ?? null,
  };
}

function fromCached(
  cached: CachedShareTokenRow,
): AtlasBriefShareTokenEntity {
  return {
    id: cached.id,
    briefId: cached.briefId,
    token: cached.token,
    createdAt: new Date(cached.createdAtMs),
    expiresAt: cached.expiresAtMs !== null ? new Date(cached.expiresAtMs) : null,
    revokedAt: cached.revokedAtMs !== null ? new Date(cached.revokedAtMs) : null,
  };
}

export interface BriefShareTokenRepository {
  mintToken(
    briefId: string,
    scope: AccessScope,
    options?: { expiresAt?: Date | null },
  ): Promise<AtlasBriefShareTokenEntity>;
  listTokensForBrief(
    briefId: string,
    scope: AccessScope,
  ): Promise<AtlasBriefShareTokenEntity[]>;
  revokeToken(tokenId: string, scope: AccessScope): Promise<void>;
  findActiveByToken(
    token: string,
  ): Promise<AtlasBriefShareTokenEntity | null>;
}

async function briefOwnerId(briefId: string): Promise<string | null> {
  const rows = await db
    .select({ ownerId: AtlasBriefsTable.ownerId })
    .from(AtlasBriefsTable)
    .where(eq(AtlasBriefsTable.id, briefId))
    .limit(1);
  return rows[0]?.ownerId ?? null;
}

export const pgBriefShareTokenRepository: BriefShareTokenRepository = {
  async mintToken(briefId, scope, options) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "mintToken: only user scope is permitted (share scope cannot create tokens; system scope is not a human actor)",
      );
    }
    const ownerId = await briefOwnerId(briefId);
    if (ownerId === null) {
      throw new AccessDeniedError("mintToken: brief not found");
    }
    if (ownerId !== scope.userId) {
      throw new AccessDeniedError("mintToken: user does not own this brief");
    }
    const token = randomBytes(24).toString("hex");
    const [row] = await db
      .insert(AtlasBriefShareTokensTable)
      .values({
        briefId,
        token,
        ...(options?.expiresAt !== undefined
          ? { expiresAt: options.expiresAt }
          : {}),
      })
      .returning();
    // Invalidate defensively — a new token cannot collide with an
    // existing cache entry today, but keeping mint/revoke symmetric
    // makes the cache story easy to reason about.
    await serverCache.delete(shareTokenCacheKey(token));
    return row;
  },

  async listTokensForBrief(briefId, scope) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "listTokensForBrief: only user scope is permitted",
      );
    }
    const ownerId = await briefOwnerId(briefId);
    if (ownerId === null) return [];
    if (ownerId !== scope.userId) {
      throw new AccessDeniedError(
        "listTokensForBrief: user does not own this brief",
      );
    }
    return await db
      .select()
      .from(AtlasBriefShareTokensTable)
      .where(eq(AtlasBriefShareTokensTable.briefId, briefId));
  },

  async revokeToken(tokenId, scope) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "revokeToken: only user scope is permitted",
      );
    }
    const rows = await db
      .select({
        briefId: AtlasBriefShareTokensTable.briefId,
        token: AtlasBriefShareTokensTable.token,
      })
      .from(AtlasBriefShareTokensTable)
      .where(eq(AtlasBriefShareTokensTable.id, tokenId))
      .limit(1);
    if (rows.length === 0) {
      throw new AccessDeniedError("revokeToken: token not found");
    }
    const ownerId = await briefOwnerId(rows[0].briefId);
    if (ownerId !== scope.userId) {
      throw new AccessDeniedError(
        "revokeToken: user does not own the parent brief",
      );
    }
    await db
      .update(AtlasBriefShareTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(AtlasBriefShareTokensTable.id, tokenId));
    // Explicit cache invalidation so a revoked token cannot sneak past
    // a same-request stale read. Matches Rec 2 invariants.
    await serverCache.delete(shareTokenCacheKey(rows[0].token));
  },

  async findActiveByToken(token) {
    const cacheKey = shareTokenCacheKey(token);
    const cached = await serverCache.get<CachedShareTokenRow>(cacheKey);
    if (cached !== undefined) {
      const hydrated = fromCached(cached);
      if (
        hydrated.revokedAt === null &&
        (hydrated.expiresAt === null ||
          hydrated.expiresAt.getTime() > Date.now())
      ) {
        return hydrated;
      }
      // Cached row has since expired; fall through to DB so the stale
      // entry is overwritten or evicted.
      await serverCache.delete(cacheKey);
    }
    const rows = await db
      .select()
      .from(AtlasBriefShareTokensTable)
      .where(
        and(
          eq(AtlasBriefShareTokensTable.token, token),
          isNull(AtlasBriefShareTokensTable.revokedAt),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    await serverCache.set(cacheKey, toCached(row), SHARE_TOKEN_CACHE_TTL_MS);
    return row;
  },
};
