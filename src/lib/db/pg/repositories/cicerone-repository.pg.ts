// @ts-nocheck
// ---------------------------------------------------------------------------
// CICERONE repository — read access to cicerone_kb.* and demo writes to
// atlas_demo.*.
//
// Pattern mirrors knowledge-repository.pg.ts: typed search functions that
// build a single parameterised SQL statement, return shaped rows, and
// never expose the raw client to callers.
//
// Scope:
//   * tier briefs read     — `searchTierBriefs`
//   * source chunk read    — `searchCiceroneChunks`
//   * source doc list read — `listCiceroneDocuments`
//   * testbed read         — `searchTestbeds` (returns 0 rows when Stage 2.6 deferred)
//   * demo passport write  — `insertDemoPassport`, `insertDemoClaims`
//   * demo matching write  — `insertDemoMatches`, `searchDemoPassportMatches`
//
// All writes set `is_demo=true` where the column exists. CICERONE never
// touches atlas.* (production) — that is JARVIS's surface.
// ---------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";

// ---------------------------------------------------------------------------
// Reads — cicerone_kb
// ---------------------------------------------------------------------------

export type TierBriefSearchResult = {
  tierNumber: number;
  title: string;
  similarity: number;
  excerpt: string;
};

export async function searchTierBriefs(params: {
  embeddingLiteral: string;
  topK?: number;
}): Promise<TierBriefSearchResult[]> {
  const limit = Math.min(3, Math.max(1, params.topK ?? 3));
  const embLit = params.embeddingLiteral;

  const results = await db.execute<{
    tier_number: number;
    title: string;
    similarity: number;
    excerpt: string;
  }>(
    sql.raw(`
      SELECT
        tier_number,
        title,
        1 - (embedding <=> '${embLit}'::vector) AS similarity,
        left(body, 800) AS excerpt
      FROM cicerone_kb.tier_briefs
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> '${embLit}'::vector
      LIMIT ${limit}
    `),
  );

  return results.rows.map((r) => ({
    tierNumber: r.tier_number,
    title: r.title,
    similarity: Number(r.similarity),
    excerpt: r.excerpt,
  }));
}

export type CiceroneChunkSearchResult = {
  documentId: string;
  documentTitle: string;
  sourceType: string;
  tier: string | null;
  chunkIndex: number;
  body: string;
  tokenCount: number;
  similarity: number;
};

export async function searchCiceroneChunks(params: {
  embeddingLiteral: string;
  topK?: number;
}): Promise<CiceroneChunkSearchResult[]> {
  const limit = Math.min(10, Math.max(1, params.topK ?? 6));
  const embLit = params.embeddingLiteral;

  const results = await db.execute<{
    document_id: string;
    document_title: string;
    source_type: string;
    tier: string | null;
    chunk_index: number;
    body: string;
    token_count: number;
    similarity: number;
  }>(
    sql.raw(`
      SELECT
        d.id            AS document_id,
        d.title         AS document_title,
        d.source_type,
        d.tier,
        c.chunk_index,
        c.body,
        c.token_count,
        1 - (c.embedding <=> '${embLit}'::vector) AS similarity
      FROM cicerone_kb.source_chunks c
      JOIN cicerone_kb.source_documents d ON d.id = c.document_id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> '${embLit}'::vector
      LIMIT ${limit}
    `),
  );

  return results.rows.map((r) => ({
    documentId: r.document_id,
    documentTitle: r.document_title,
    sourceType: r.source_type,
    tier: r.tier,
    chunkIndex: r.chunk_index,
    body: r.body,
    tokenCount: r.token_count,
    similarity: Number(r.similarity),
  }));
}

export type CiceroneDocumentRow = {
  id: string;
  title: string;
  sourceType: string;
  tier: string | null;
  chunkCount: number;
};

export async function listCiceroneDocuments(): Promise<CiceroneDocumentRow[]> {
  const results = await db.execute<{
    id: string;
    title: string;
    source_type: string;
    tier: string | null;
    chunk_count: string;
  }>(
    sql.raw(`
      SELECT
        d.id,
        d.title,
        d.source_type,
        d.tier,
        COUNT(c.id)::text AS chunk_count
      FROM cicerone_kb.source_documents d
      LEFT JOIN cicerone_kb.source_chunks c ON c.document_id = d.id
      GROUP BY d.id, d.title, d.source_type, d.tier
      ORDER BY d.title
    `),
  );

  return results.rows.map((r) => ({
    id: r.id,
    title: r.title,
    sourceType: r.source_type,
    tier: r.tier,
    chunkCount: Number(r.chunk_count),
  }));
}

export type TestbedSearchResult = {
  rowNumber: number | null;
  sector: string | null;
  location: string | null;
  whatCanBeTested: string | null;
  similarity: number;
};

export async function searchTestbeds(params: {
  embeddingLiteral: string;
  topK?: number;
}): Promise<TestbedSearchResult[]> {
  const limit = Math.min(10, Math.max(1, params.topK ?? 5));
  const embLit = params.embeddingLiteral;

  const results = await db.execute<{
    row_number: number | null;
    sector: string | null;
    location: string | null;
    what_can_be_tested: string | null;
    similarity: number;
  }>(
    sql.raw(`
      SELECT
        row_number,
        sector,
        location,
        what_can_be_tested,
        1 - (description_embedding <=> '${embLit}'::vector) AS similarity
      FROM cicerone_kb.testbeds
      WHERE description_embedding IS NOT NULL
      ORDER BY description_embedding <=> '${embLit}'::vector
      LIMIT ${limit}
    `),
  );

  return results.rows.map((r) => ({
    rowNumber: r.row_number,
    sector: r.sector,
    location: r.location,
    whatCanBeTested: r.what_can_be_tested,
    similarity: Number(r.similarity),
  }));
}

// ---------------------------------------------------------------------------
// Writes — atlas_demo.*
//
// CICERONE only writes to atlas_demo. is_demo defaults to true on the
// passports table; we set it explicitly anyway. Claims and gaps inherit
// the demo flag through their FK to a demo passport.
// ---------------------------------------------------------------------------

export type InsertDemoPassportInput = {
  passportType:
    | "evidence_profile"
    | "capability_profile"
    | "requirements_profile"
    | "certification_record";
  title: string;
  ownerOrg?: string | null;
  ownerName?: string | null;
  summary?: string | null;
  context?: string | null;
  trlLevel?: number | null;
  trlTarget?: number | null;
  sectorOrigin?: string[] | null;
  sectorTarget?: string[] | null;
  tags?: string[] | null;
  embeddingLiteral?: string | null;
};

export async function insertDemoPassport(
  input: InsertDemoPassportInput,
): Promise<{ id: string }> {
  const v = (x: unknown) =>
    x === null || x === undefined ? "NULL" : `'${String(x).replace(/'/g, "''")}'`;
  const arr = (x: string[] | null | undefined) =>
    !x || x.length === 0
      ? "NULL"
      : `ARRAY[${x.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}]::text[]`;
  const num = (x: number | null | undefined) =>
    x === null || x === undefined ? "NULL" : String(x);
  const emb =
    input.embeddingLiteral && input.embeddingLiteral.length > 0
      ? `'${input.embeddingLiteral}'::vector`
      : "NULL";

  const result = await db.execute<{ id: string }>(
    sql.raw(`
      INSERT INTO atlas_demo.passports (
        passport_type, title, owner_org, owner_name, summary, context,
        trl_level, trl_target, sector_origin, sector_target, tags,
        embedding, is_demo
      )
      VALUES (
        ${v(input.passportType)},
        ${v(input.title)},
        ${v(input.ownerOrg ?? null)},
        ${v(input.ownerName ?? null)},
        ${v(input.summary ?? null)},
        ${v(input.context ?? null)},
        ${num(input.trlLevel ?? null)},
        ${num(input.trlTarget ?? null)},
        ${arr(input.sectorOrigin ?? null)},
        ${arr(input.sectorTarget ?? null)},
        ${arr(input.tags ?? null)},
        ${emb},
        true
      )
      RETURNING id
    `),
  );

  return { id: result.rows[0].id };
}

export type InsertDemoClaimInput = {
  passportId: string;
  claimRole: "asserts" | "requires" | "constrains";
  claimDomain:
    | "capability"
    | "evidence"
    | "certification"
    | "performance"
    | "regulatory";
  claimText: string;
  conditions?: string | null;
  confidenceTier?: "verified" | "self_reported" | "ai_inferred" | null;
  confidenceReason?: string | null;
  source?: string | null;
};

export async function insertDemoClaims(
  claims: InsertDemoClaimInput[],
): Promise<{ ids: string[] }> {
  if (claims.length === 0) return { ids: [] };

  const v = (x: unknown) =>
    x === null || x === undefined ? "NULL" : `'${String(x).replace(/'/g, "''")}'`;

  const values = claims
    .map(
      (c) => `(
        ${v(c.passportId)},
        ${v(c.claimRole)},
        ${v(c.claimDomain)},
        ${v(c.claimText)},
        ${v(c.conditions ?? null)},
        ${v(c.confidenceTier ?? "ai_inferred")},
        ${v(c.confidenceReason ?? null)},
        ${v(c.source ?? "cicerone_demo")}
      )`,
    )
    .join(",");

  const result = await db.execute<{ id: string }>(
    sql.raw(`
      INSERT INTO atlas_demo.passport_claims (
        passport_id, claim_role, claim_domain, claim_text,
        conditions, confidence_tier, confidence_reason, source
      )
      VALUES ${values}
      RETURNING id
    `),
  );

  return { ids: result.rows.map((r) => r.id) };
}

// ---------------------------------------------------------------------------
// Demo matching — cosine similarity against atlas.live_calls + atlas.projects
//
// Reads atlas.* (production), writes only to atlas_demo.matches. This is the
// ONE direction of cross-schema data flow that CICERONE is allowed:
// production-corpus reads to feed demo-mode matching.
// ---------------------------------------------------------------------------

export type DemoMatchRow = {
  matchType: "project" | "live_call";
  refId: string;
  title: string;
  funder: string | null;
  fundingAmount: number | null;
  similarity: number;
};

export async function runDemoMatching(params: {
  passportId: string;
  topK?: number;
}): Promise<DemoMatchRow[]> {
  const limit = Math.min(10, Math.max(1, params.topK ?? 5));

  const projectRows = await db.execute<{
    ref_id: string;
    title: string;
    lead_funder: string | null;
    funding_amount: number | null;
    similarity: number;
  }>(
    sql.raw(`
      WITH src AS (
        SELECT embedding FROM atlas_demo.passports WHERE id = '${params.passportId}'
      )
      SELECT
        p.id::text AS ref_id,
        p.title,
        p.lead_funder,
        p.funding_amount,
        1 - (p.embedding <=> (SELECT embedding FROM src)) AS similarity
      FROM atlas.projects p, src
      WHERE p.embedding IS NOT NULL
        AND (SELECT embedding FROM src) IS NOT NULL
      ORDER BY p.embedding <=> (SELECT embedding FROM src)
      LIMIT ${limit}
    `),
  );

  const liveCallRows = await db.execute<{
    ref_id: string;
    title: string;
    funder: string | null;
    similarity: number;
  }>(
    sql.raw(`
      WITH src AS (
        SELECT embedding FROM atlas_demo.passports WHERE id = '${params.passportId}'
      )
      SELECT
        lc.id::text AS ref_id,
        lc.title,
        lc.funder,
        1 - (lc.embedding <=> (SELECT embedding FROM src)) AS similarity
      FROM atlas.live_calls lc, src
      WHERE lc.embedding IS NOT NULL
        AND (SELECT embedding FROM src) IS NOT NULL
      ORDER BY lc.embedding <=> (SELECT embedding FROM src)
      LIMIT ${limit}
    `),
  );

  const projectMatches: DemoMatchRow[] = projectRows.rows.map((r) => ({
    matchType: "project" as const,
    refId: r.ref_id,
    title: r.title,
    funder: r.lead_funder,
    fundingAmount:
      r.funding_amount === null ? null : Number(r.funding_amount),
    similarity: Number(r.similarity),
  }));

  const liveCallMatches: DemoMatchRow[] = liveCallRows.rows.map((r) => ({
    matchType: "live_call" as const,
    refId: r.ref_id,
    title: r.title,
    funder: r.funder,
    fundingAmount: null,
    similarity: Number(r.similarity),
  }));

  const all = [...projectMatches, ...liveCallMatches]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  // Persist top matches to atlas_demo.matches.
  if (all.length > 0) {
    const v = (x: unknown) =>
      x === null || x === undefined
        ? "NULL"
        : `'${String(x).replace(/'/g, "''")}'`;
    const num = (x: number | null) => (x === null ? "NULL" : String(x));

    const values = all
      .map(
        (m) => `(
          ${v(params.passportId)},
          ${m.matchType === "project" ? v(m.refId) : "NULL"},
          ${m.matchType === "live_call" ? v(m.refId) : "NULL"},
          ${num(m.similarity)},
          ${v(`Cosine ${m.similarity.toFixed(3)} vs ${m.title}`)},
          ${v(m.matchType)}
        )`,
      )
      .join(",");

    await db.execute(
      sql.raw(`
        INSERT INTO atlas_demo.matches (
          passport_id, project_id, live_call_id,
          match_score, match_summary, match_type
        )
        VALUES ${values}
      `),
    );
  }

  return all;
}
