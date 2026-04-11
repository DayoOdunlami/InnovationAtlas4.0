import "server-only";
import type { Pool } from "pg";

export type VerifyClaimAction = "verify" | "reject" | "note";

/**
 * Shared DB mutations for /api/passport/verify-claim and JARVIS tools.
 * Reject path matches the API route (soft reject, downgrade verified tier).
 */
export async function applyPassportClaimAction(
  pool: Pool,
  params: {
    claim_id: string;
    action: VerifyClaimAction;
    note?: string;
    /** Required when action is verify */
    verified_by?: string;
  },
): Promise<{ claim: Record<string, unknown>; passport_id: string }> {
  const { claim_id, action, note, verified_by = "" } = params;

  const existing = await pool.query<{ id: string; passport_id: string }>(
    `SELECT id, passport_id FROM atlas.passport_claims WHERE id = $1`,
    [claim_id],
  );

  if (existing.rows.length === 0) {
    throw new Error("Claim not found");
  }

  const passport_id = existing.rows[0].passport_id;
  let updatedClaim: Record<string, unknown>;

  if (action === "verify") {
    if (!verified_by) {
      throw new Error("verified_by is required for verify action");
    }
    const result = await pool.query(
      `UPDATE atlas.passport_claims
       SET confidence_tier = 'verified',
           verified_at     = now(),
           verified_by     = $2,
           rejected        = false
       WHERE id = $1
       RETURNING *`,
      [claim_id, verified_by],
    );
    updatedClaim = result.rows[0];
  } else if (action === "reject") {
    const result = await pool.query(
      `UPDATE atlas.passport_claims
       SET rejected = true,
           confidence_tier = CASE
             WHEN confidence_tier = 'verified' THEN 'ai_inferred'
             ELSE confidence_tier
           END
       WHERE id = $1
       RETURNING *`,
      [claim_id],
    );
    updatedClaim = result.rows[0];
  } else {
    if (!note) throw new Error("note required for action note");
    const result = await pool.query(
      `UPDATE atlas.passport_claims SET user_note = $2 WHERE id = $1 RETURNING *`,
      [claim_id, note],
    );
    updatedClaim = result.rows[0];
  }

  return { claim: updatedClaim, passport_id };
}
