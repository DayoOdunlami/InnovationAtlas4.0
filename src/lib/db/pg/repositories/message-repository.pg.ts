// ---------------------------------------------------------------------------
// Message repository (Phase 1, Brief-First Rebuild — Data Model Spec §4.3)
//
// CRUD against `atlas.messages`, gated by the `AccessScope` contract. Like
// brief-repository, access control is enforced in each method (no RLS).
//
// Phase-1 semantics
// -----------------
// * `appendMessage(briefId, input, scope)`
//     - Permit iff `scope.kind === 'user'` and that user owns the brief.
//     - Share scope is read-only in v1: external viewers cannot append
//       chat messages.
//     - System scope is never permitted here (per Data Model Spec §6).
//
// * `listMessagesByBriefId(briefId, scope)`
//     - Permit owner under a user scope.
//     - Permit a valid active share-token scope that matches the brief
//       (Data Model Spec §13 Q1 default: share readers see chat history;
//       Phase 1 recon APPROVED DEFAULT #13 confirms).
//     - System scope is denied.
//
// Ordering follows the `atlas_messages_brief_created_idx` index.
// ---------------------------------------------------------------------------

import { and, asc, eq, isNull } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  AtlasBriefShareTokensTable,
  AtlasBriefsTable,
  AtlasMessagesTable,
  type AtlasMessageEntity,
} from "../schema.pg";
import { AccessDeniedError, type AccessScope } from "./access-scope";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface AppendMessageInput {
  role: MessageRole;
  contentJson: unknown;
  toolCalls?: unknown;
  transcript?: boolean;
}

export interface MessageRepository {
  appendMessage(
    briefId: string,
    input: AppendMessageInput,
    scope: AccessScope,
  ): Promise<AtlasMessageEntity>;
  listMessagesByBriefId(
    briefId: string,
    scope: AccessScope,
  ): Promise<AtlasMessageEntity[]>;
}

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

export const pgMessageRepository: MessageRepository = {
  async appendMessage(briefId, input, scope) {
    if (scope.kind !== "user") {
      throw new AccessDeniedError(
        "appendMessage: only user scope is permitted (share scope is read-only; system scope is not a message author)",
      );
    }
    const ownerId = await briefOwnerId(briefId);
    if (ownerId === null) {
      throw new AccessDeniedError("appendMessage: brief not found");
    }
    if (ownerId !== scope.userId) {
      throw new AccessDeniedError(
        "appendMessage: user does not own this brief",
      );
    }
    const [row] = await db
      .insert(AtlasMessagesTable)
      .values({
        briefId,
        role: input.role,
        contentJson: input.contentJson as object,
        ...(input.toolCalls !== undefined
          ? { toolCalls: input.toolCalls as object }
          : {}),
        ...(input.transcript !== undefined
          ? { transcript: input.transcript }
          : {}),
      })
      .returning();
    return row;
  },

  async listMessagesByBriefId(briefId, scope) {
    if (scope.kind === "system") {
      throw new AccessDeniedError(
        "listMessagesByBriefId: system scope is not permitted for user-facing reads",
      );
    }
    if (scope.kind === "user") {
      const ownerId = await briefOwnerId(briefId);
      if (ownerId === null) return [];
      if (ownerId !== scope.userId) {
        throw new AccessDeniedError(
          "listMessagesByBriefId: user does not own this brief",
        );
      }
    } else {
      const permitted = await isActiveShareForBrief(briefId, scope.token);
      if (!permitted) {
        throw new AccessDeniedError(
          "listMessagesByBriefId: share token is invalid, expired, or revoked",
        );
      }
    }
    const rows = await db
      .select()
      .from(AtlasMessagesTable)
      .where(eq(AtlasMessagesTable.briefId, briefId))
      .orderBy(asc(AtlasMessagesTable.createdAt));
    return rows;
  },
};
