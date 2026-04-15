import "server-only";
import pg from "pg";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import type { ExtractedClaim } from "./claim-extractor";
import { getPassportPool } from "./pg-pool";

export { getPassportPool };

export type SavedClaim = ExtractedClaim & {
  id: string;
  passport_id: string;
  source_document_id: string | null;
  created_at: string;
};

/**
 * Write extracted claims to atlas.passport_claims and immediately embed each
 * claim using text-embedding-3-small.
 *
 * Confidence ceiling is enforced here as a second layer:
 * any row with confidence_tier = 'verified' is rejected with a thrown error.
 *
 * Embedding failures are non-fatal: the claim is still saved and the error is
 * logged so the backfill script can recover the row later.
 */
export async function saveClaims(
  pool: pg.Pool,
  passportId: string,
  claims: ExtractedClaim[],
  sourceDocumentId: string | null,
): Promise<SavedClaim[]> {
  const saved: SavedClaim[] = [];

  for (const claim of claims) {
    // SECOND-LAYER confidence ceiling guard
    if (claim.confidence_tier === "verified") {
      throw new Error(
        "CONFIDENCE CEILING VIOLATION: cannot write confidence_tier = 'verified' from extraction pipeline",
      );
    }

    const result = await pool.query(
      `INSERT INTO atlas.passport_claims
         (passport_id, claim_role, claim_domain, claim_text, conditions,
          confidence_tier, confidence_reason, source_document_id, source_excerpt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        passportId,
        claim.claim_role,
        claim.claim_domain,
        claim.claim_text,
        claim.conditions ?? null,
        claim.confidence_tier,
        claim.confidence_reason,
        sourceDocumentId,
        claim.source_excerpt,
      ],
    );
    const savedClaim = result.rows[0] as SavedClaim;
    saved.push(savedClaim);

    // Generate and store claim embedding immediately after insert
    try {
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: claim.claim_text,
      });
      const vectorLiteral = `[${embedding.join(",")}]`;
      await updatePassportClaimEmbedding(pool, savedClaim.id, vectorLiteral);
    } catch (embedErr) {
      // Non-fatal: claim is saved, embedding can be back-filled
      console.error(
        `[saveClaims] embedding failed for claim ${savedClaim.id}:`,
        embedErr,
      );
    }
  }

  return saved;
}

export async function markDocumentComplete(
  pool: pg.Pool,
  documentId: string,
  claimsCount: number,
): Promise<void> {
  await pool.query(
    `UPDATE atlas.passport_documents
     SET processing_status = 'complete',
         processed_at = now(),
         claims_extracted = $2
     WHERE id = $1`,
    [documentId, claimsCount],
  );
}

export async function markDocumentFailed(
  pool: pg.Pool,
  documentId: string,
  error: string,
): Promise<void> {
  await pool.query(
    `UPDATE atlas.passport_documents
     SET processing_status = 'failed',
         processed_at = now()
     WHERE id = $1`,
    [documentId],
  );
  console.error(`[passport/extract] Document ${documentId} failed: ${error}`);
}

export type InsertPassportClaimInput = {
  passport_id: string;
  claim_role: string;
  claim_domain: string;
  claim_text: string;
  conditions: string | null;
  confidence_tier: string;
  confidence_reason: string;
  source_document_id: string | null;
  source_excerpt: string;
  conflict_flag?: boolean;
  conflicting_claim_id?: string | null;
  conflict_resolution?: string | null;
};

export async function insertPassportClaimRow(
  pool: pg.Pool,
  input: InsertPassportClaimInput,
): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO atlas.passport_claims
       (passport_id, claim_role, claim_domain, claim_text, conditions,
        confidence_tier, confidence_reason, source_document_id, source_excerpt,
        conflict_flag, conflicting_claim_id, conflict_resolution)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      input.passport_id,
      input.claim_role,
      input.claim_domain,
      input.claim_text,
      input.conditions,
      input.confidence_tier,
      input.confidence_reason,
      input.source_document_id,
      input.source_excerpt,
      input.conflict_flag ?? false,
      input.conflicting_claim_id ?? null,
      input.conflict_resolution ?? null,
    ],
  );
  return result.rows[0];
}

export async function updatePassportClaimEmbedding(
  pool: pg.Pool,
  claimId: string,
  vectorLiteral: string,
): Promise<void> {
  await pool.query(
    `UPDATE atlas.passport_claims SET embedding = $2::vector WHERE id = $1`,
    [claimId, vectorLiteral],
  );
}
