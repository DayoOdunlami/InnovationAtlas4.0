// ---------------------------------------------------------------------------
// Knowledge repository (KB-1, Phase 2b — Curated Knowledge Base)
//
// CRUD against `atlas.knowledge_documents` and `atlas.knowledge_chunks`,
// gated by the `AccessScope` contract from `./access-scope.ts`.
//
// Access model
// ------------
// * Reads (listDocuments, getDocumentById, listChunks) — permitted for any
//   scope: user, share, or system. The KB is organisation-wide and not
//   user-private.
// * Writes (createDocument, updateDocument, approveDocument, retireDocument,
//   upsertChunks, deleteChunks) — admin-only. The repository checks
//   `scope.kind === "system"` (used by admin server actions that already
//   verified role) or a userId-bearing `user` scope marked as admin by the
//   caller. In practice, admin server actions pass `{ kind: "system" }` to
//   the repository after confirming the session role via `requireAdminPermission`.
//
// This matches the brief-repository pattern: access control lives at the
// repository boundary; no RLS on atlas.* tables.
// ---------------------------------------------------------------------------

import { eq, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  AtlasKnowledgeChunksTable,
  AtlasKnowledgeDocumentsTable,
  type AtlasKnowledgeChunkEntity,
  type AtlasKnowledgeChunkInsert,
  type AtlasKnowledgeDocumentEntity,
  type AtlasKnowledgeDocumentInsert,
} from "../schema.pg";
import { AccessDeniedError, type AccessScope } from "./access-scope";

// ---------------------------------------------------------------------------
// Input / patch types
// ---------------------------------------------------------------------------

export type CreateKnowledgeDocumentInput = Omit<
  AtlasKnowledgeDocumentInsert,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "addedAt"
  | "approvedAt"
  | "approvedBy"
  | "retiredAt"
  | "retiredReason"
  | "chunksRefreshedAt"
  | "status"
> & {
  status?: "proposed" | "approved" | "retired";
};

export type UpdateKnowledgeDocumentPatch = Partial<
  Pick<
    AtlasKnowledgeDocumentEntity,
    | "title"
    | "sourceType"
    | "sourceUrl"
    | "storageKey"
    | "publisher"
    | "author"
    | "publishedOn"
    | "modes"
    | "themes"
    | "lensCategoryIds"
    | "tier"
    | "summary"
  >
>;

export type UpsertChunkInput = Pick<
  AtlasKnowledgeChunkInsert,
  "chunkIndex" | "body" | "tokenCount" | "embedding"
>;

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface KnowledgeRepository {
  // Documents — reads (universal scope)
  listDocuments(
    filter: { status?: "proposed" | "approved" | "retired" },
    scope: AccessScope,
  ): Promise<AtlasKnowledgeDocumentEntity[]>;

  getDocumentById(
    id: string,
    scope: AccessScope,
  ): Promise<AtlasKnowledgeDocumentEntity | null>;

  // Documents — writes (system scope only)
  createDocument(
    input: CreateKnowledgeDocumentInput,
    scope: AccessScope,
  ): Promise<AtlasKnowledgeDocumentEntity>;

  updateDocument(
    id: string,
    patch: UpdateKnowledgeDocumentPatch,
    scope: AccessScope,
  ): Promise<AtlasKnowledgeDocumentEntity>;

  approveDocument(
    id: string,
    approvedBy: string,
    scope: AccessScope,
  ): Promise<AtlasKnowledgeDocumentEntity>;

  retireDocument(
    id: string,
    reason: string,
    scope: AccessScope,
  ): Promise<AtlasKnowledgeDocumentEntity>;

  // Chunks — reads (universal scope)
  listChunks(
    documentId: string,
    scope: AccessScope,
  ): Promise<AtlasKnowledgeChunkEntity[]>;

  // Chunks — writes (system scope only)
  upsertChunks(
    documentId: string,
    chunks: UpsertChunkInput[],
    scope: AccessScope,
  ): Promise<AtlasKnowledgeChunkEntity[]>;

  deleteChunks(documentId: string, scope: AccessScope): Promise<void>;

  stampChunksRefreshed(documentId: string, scope: AccessScope): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireWriteScope(scope: AccessScope, action: string): void {
  if (scope.kind !== "system") {
    throw new AccessDeniedError(
      `${action}: write operations on knowledge_documents require system scope (admin server actions must call requireAdminPermission before passing { kind: "system" })`,
    );
  }
}

async function readDocumentRow(
  id: string,
): Promise<AtlasKnowledgeDocumentEntity | null> {
  const [row] = await db
    .select()
    .from(AtlasKnowledgeDocumentsTable)
    .where(eq(AtlasKnowledgeDocumentsTable.id, id))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const pgKnowledgeRepository: KnowledgeRepository = {
  async listDocuments(filter, _scope) {
    if (filter.status) {
      const rows = await db
        .select()
        .from(AtlasKnowledgeDocumentsTable)
        .where(eq(AtlasKnowledgeDocumentsTable.status, filter.status))
        .orderBy(AtlasKnowledgeDocumentsTable.addedAt);
      return rows;
    }
    const rows = await db
      .select()
      .from(AtlasKnowledgeDocumentsTable)
      .orderBy(AtlasKnowledgeDocumentsTable.addedAt);
    return rows;
  },

  async getDocumentById(id, _scope) {
    return readDocumentRow(id);
  },

  async createDocument(input, scope) {
    requireWriteScope(scope, "createDocument");
    const [row] = await db
      .insert(AtlasKnowledgeDocumentsTable)
      .values({
        ...input,
        status: input.status ?? "proposed",
      })
      .returning();
    return row;
  },

  async updateDocument(id, patch, scope) {
    requireWriteScope(scope, "updateDocument");
    const existing = await readDocumentRow(id);
    if (!existing) {
      throw new AccessDeniedError("updateDocument: document not found");
    }
    const [row] = await db
      .update(AtlasKnowledgeDocumentsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(AtlasKnowledgeDocumentsTable.id, id))
      .returning();
    return row;
  },

  async approveDocument(id, approvedBy, scope) {
    requireWriteScope(scope, "approveDocument");
    const existing = await readDocumentRow(id);
    if (!existing) {
      throw new AccessDeniedError("approveDocument: document not found");
    }
    const [row] = await db
      .update(AtlasKnowledgeDocumentsTable)
      .set({
        status: "approved",
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(AtlasKnowledgeDocumentsTable.id, id))
      .returning();
    return row;
  },

  async retireDocument(id, reason, scope) {
    requireWriteScope(scope, "retireDocument");
    const existing = await readDocumentRow(id);
    if (!existing) {
      throw new AccessDeniedError("retireDocument: document not found");
    }
    const [row] = await db
      .update(AtlasKnowledgeDocumentsTable)
      .set({
        status: "retired",
        retiredAt: new Date(),
        retiredReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(AtlasKnowledgeDocumentsTable.id, id))
      .returning();
    return row;
  },

  async listChunks(documentId, _scope) {
    const rows = await db
      .select()
      .from(AtlasKnowledgeChunksTable)
      .where(eq(AtlasKnowledgeChunksTable.documentId, documentId))
      .orderBy(AtlasKnowledgeChunksTable.chunkIndex);
    return rows;
  },

  async upsertChunks(documentId, chunks, scope) {
    requireWriteScope(scope, "upsertChunks");
    if (chunks.length === 0) return [];
    const values: AtlasKnowledgeChunkInsert[] = chunks.map((c) => ({
      documentId,
      chunkIndex: c.chunkIndex,
      body: c.body,
      tokenCount: c.tokenCount ?? 0,
      embedding: c.embedding,
    }));
    const rows = await db
      .insert(AtlasKnowledgeChunksTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          AtlasKnowledgeChunksTable.documentId,
          AtlasKnowledgeChunksTable.chunkIndex,
        ],
        set: {
          body: sql`excluded.body`,
          tokenCount: sql`excluded.token_count`,
          embedding: sql`excluded.embedding`,
        },
      })
      .returning();
    return rows;
  },

  async deleteChunks(documentId, scope) {
    requireWriteScope(scope, "deleteChunks");
    await db
      .delete(AtlasKnowledgeChunksTable)
      .where(eq(AtlasKnowledgeChunksTable.documentId, documentId));
  },

  async stampChunksRefreshed(documentId, scope) {
    requireWriteScope(scope, "stampChunksRefreshed");
    await db
      .update(AtlasKnowledgeDocumentsTable)
      .set({ chunksRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(AtlasKnowledgeDocumentsTable.id, documentId));
  },
};

// ---------------------------------------------------------------------------
// Coverage matrix helper — modes × themes count of approved docs.
// Used by the admin UI coverage panel.
// ---------------------------------------------------------------------------

export async function getKnowledgeCoverageMatrix(): Promise<
  Array<{ mode: string; theme: string; count: number }>
> {
  const rows = await db
    .select()
    .from(AtlasKnowledgeDocumentsTable)
    .where(eq(AtlasKnowledgeDocumentsTable.status, "approved"));

  const MODES = ["rail", "aviation", "maritime", "hit"] as const;
  const THEMES = [
    "autonomy",
    "decarbonisation",
    "people_experience",
    "hubs_clusters",
    "planning_operation",
    "industry",
  ] as const;

  const matrix: Array<{ mode: string; theme: string; count: number }> = [];
  for (const mode of MODES) {
    for (const theme of THEMES) {
      const count = rows.filter(
        (r) =>
          (r.modes as string[]).includes(mode) &&
          (r.themes as string[]).includes(theme),
      ).length;
      matrix.push({ mode, theme, count });
    }
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Vector-search helper — used internally by surfaceKnowledgeBase tool.
// Returns top-K chunks with their parent document metadata.
// ---------------------------------------------------------------------------

export type KnowledgeSearchResult = {
  documentId: string;
  title: string;
  publisher: string | null;
  publishedOn: string | null;
  sourceType: string;
  tier: string;
  chunkIndex: number;
  body: string;
  tokenCount: number;
  similarity: number;
};

export async function searchKnowledgeChunks(params: {
  embeddingLiteral: string;
  modes?: string[];
  themes?: string[];
  topK?: number;
}): Promise<KnowledgeSearchResult[]> {
  const limit = Math.min(10, Math.max(1, params.topK ?? 6));

  // Build raw SQL fragments for array-overlap filters.
  // Using sql.raw for the array literals is safe here because the values
  // are validated against a fixed enum before reaching this function.
  const hasModeFilter = params.modes && params.modes.length > 0;
  const hasThemeFilter = params.themes && params.themes.length > 0;

  const modeArray = hasModeFilter
    ? `ARRAY[${params.modes!.map((m) => `'${m}'`).join(",")}]::text[]`
    : null;
  const themeArray = hasThemeFilter
    ? `ARRAY[${params.themes!.map((t) => `'${t}'`).join(",")}]::text[]`
    : null;

  const modeClause = modeArray ? `AND d.modes && ${modeArray}` : "";
  const themeClause = themeArray ? `AND d.themes && ${themeArray}` : "";

  const embLit = params.embeddingLiteral;

  const results = await db.execute<{
    document_id: string;
    title: string;
    publisher: string | null;
    published_on: string | null;
    source_type: string;
    tier: string;
    chunk_index: number;
    body: string;
    token_count: number;
    similarity: number;
  }>(
    sql.raw(`
      SELECT
        d.id          AS document_id,
        d.title,
        d.publisher,
        d.published_on::text,
        d.source_type,
        d.tier,
        c.chunk_index,
        c.body,
        c.token_count,
        1 - (c.embedding <=> '${embLit}'::vector) AS similarity
      FROM atlas.knowledge_chunks c
      JOIN atlas.knowledge_documents d ON d.id = c.document_id
      WHERE d.status = 'approved'
      ${modeClause}
      ${themeClause}
      ORDER BY c.embedding <=> '${embLit}'::vector
      LIMIT ${limit}
    `),
  );

  return results.rows.map((r) => ({
    documentId: r.document_id,
    title: r.title,
    publisher: r.publisher,
    publishedOn: r.published_on,
    sourceType: r.source_type,
    tier: r.tier,
    chunkIndex: r.chunk_index,
    body: r.body,
    tokenCount: r.token_count,
    similarity: Number(r.similarity),
  }));
}
