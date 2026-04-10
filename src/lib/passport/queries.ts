import "server-only";
import { getPassportPool } from "@/lib/passport/db";
import type {
  PassportRow,
  PassportDocumentRow,
  PassportClaimRow,
  PassportDetail,
} from "./types";

export async function getPassportList(): Promise<PassportRow[]> {
  const pool = getPassportPool();
  try {
    const result = await pool.query<PassportRow>(
      `SELECT id, passport_type, title, owner_org, owner_name, summary,
              trl_level, trl_target, sector_origin, sector_target, created_at, updated_at
       FROM atlas.passports
       ORDER BY updated_at DESC`,
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
        `SELECT id, passport_type, title, owner_org, owner_name, summary, context,
                trl_level, trl_target, sector_origin, sector_target,
                approval_body, approval_ref, approval_date::text, valid_conditions,
                created_at::text, updated_at::text
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
