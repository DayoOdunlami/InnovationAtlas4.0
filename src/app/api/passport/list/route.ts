import { NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { getPassportPool } from "@/lib/passport/db";
import type { PassportSummary } from "@/lib/passport/types";

/**
 * GET /api/passport/list
 * Returns all passports with claim/document counts.
 * Used by the SaveToPassportDialog and JARVIS tools.
 */
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = getPassportPool();
  try {
    const result = await pool.query<PassportSummary>(
      `SELECT
         p.id, p.passport_type, p.title, p.project_name, p.project_description,
         p.owner_org, p.owner_name, p.user_id,
         p.trl_level, p.trl_target, p.tags,
         p.trial_date_start::text, p.trial_date_end::text,
         p.is_archived, p.created_at::text, p.updated_at::text,
         COUNT(DISTINCT pc.id) FILTER (WHERE pc.rejected = false)::int  AS claim_count,
         COUNT(DISTINCT pc.id) FILTER (WHERE pc.confidence_tier = 'verified' AND pc.rejected = false)::int AS verified_count,
         COUNT(DISTINCT pd.id)::int AS document_count
       FROM atlas.passports p
       LEFT JOIN atlas.passport_claims  pc ON pc.passport_id  = p.id
       LEFT JOIN atlas.passport_documents pd ON pd.passport_id = p.id
       WHERE COALESCE(p.is_archived, false) = false
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
    );

    return NextResponse.json({ passports: result.rows });
  } finally {
    await pool.end();
  }
}
