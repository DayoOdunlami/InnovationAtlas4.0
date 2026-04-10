import "server-only";
import { getPassportPool } from "@/lib/passport/db";
import type {
  PassportSummary,
  PassportRow,
  PassportDocumentRow,
  PassportClaimRow,
  PassportDetail,
} from "./types";

export async function getPassportList(): Promise<PassportSummary[]> {
  const pool = getPassportPool();
  try {
    const result = await pool.query<PassportSummary>(
      `SELECT
         p.id, p.passport_type, p.title, p.project_name, p.owner_org, p.owner_name,
         p.user_id, p.trl_level, p.trl_target, p.sector_origin, p.sector_target,
         p.tags, p.trial_date_start::text, p.trial_date_end::text,
         p.is_archived, p.created_at::text, p.updated_at::text,
         COUNT(DISTINCT pc.id) FILTER (WHERE pc.rejected = false)::int            AS claim_count,
         COUNT(DISTINCT pc.id) FILTER (WHERE pc.confidence_tier = 'verified'
                                         AND pc.rejected = false)::int            AS verified_count,
         COUNT(DISTINCT pd.id)::int                                               AS document_count
       FROM atlas.passports p
       LEFT JOIN atlas.passport_claims   pc ON pc.passport_id = p.id
       LEFT JOIN atlas.passport_documents pd ON pd.passport_id = p.id
       WHERE COALESCE(p.is_archived, false) = false
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

export async function getPassportDetail(
  id: string,
): Promise<PassportDetail | null> {
  const pool = getPassportPool();
  try {
    const [passportResult, docsResult, claimsResult] = await Promise.all([
      pool.query<PassportRow>(
        `SELECT id, passport_type, title, project_name, project_description,
                owner_org, owner_name, user_id, summary, context,
                trl_level, trl_target, sector_origin, sector_target,
                approval_body, approval_ref, approval_date::text, valid_conditions,
                trial_date_start::text, trial_date_end::text, tags,
                is_archived, created_at::text, updated_at::text
         FROM atlas.passports WHERE id = $1`,
        [id],
      ),
      pool.query<PassportDocumentRow>(
        `SELECT id, passport_id, filename, document_type,
                uploaded_at::text, processed_at::text,
                processing_status, claims_extracted, storage_path
         FROM atlas.passport_documents
         WHERE passport_id = $1
         ORDER BY uploaded_at DESC`,
        [id],
      ),
      pool.query<PassportClaimRow>(
        `SELECT id, passport_id, claim_role, claim_domain, claim_text, conditions,
                confidence_tier, confidence_reason, source_excerpt, source_document_id,
                verified_at::text, verified_by, rejected, user_note, created_at::text
         FROM atlas.passport_claims
         WHERE passport_id = $1 AND rejected = false
         ORDER BY claim_domain, confidence_tier`,
        [id],
      ),
    ]);

    if (!passportResult.rows[0]) return null;
    return {
      passport: passportResult.rows[0],
      documents: docsResult.rows,
      claims: claimsResult.rows,
    };
  } finally {
    await pool.end();
  }
}
