import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { getPassportPool } from "@/lib/passport/db";

/**
 * POST /api/passport/verify-claim
 *
 * This is THE ONLY route that can set confidence_tier = 'verified'.
 * All other write paths (extract, seed, migrations) are forbidden from doing so.
 *
 * Actions:
 *   'verify' — SET confidence_tier = 'verified', verified_at = now(), verified_by = user email
 *   'reject' — SET rejected = true
 *   'note'   — SET user_note = text
 *
 * A single request may include multiple actions (e.g. verify + note together).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    claim_id: string;
    action: "verify" | "reject" | "note";
    note?: string;
  };

  const { claim_id, action, note } = body;

  if (!claim_id) {
    return NextResponse.json(
      { error: "claim_id is required" },
      { status: 400 },
    );
  }

  if (!["verify", "reject", "note"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: verify, reject, note" },
      { status: 400 },
    );
  }

  if (action === "note" && !note) {
    return NextResponse.json(
      { error: "note text is required for action = 'note'" },
      { status: 400 },
    );
  }

  const pool = getPassportPool();

  try {
    // Confirm claim exists and belongs to a passport the user can access
    const existing = await pool.query(
      `SELECT id, passport_id, confidence_tier, rejected
       FROM atlas.passport_claims
       WHERE id = $1`,
      [claim_id],
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const claim = existing.rows[0];

    // Apply the action
    let updatedClaim: Record<string, unknown>;

    if (action === "verify") {
      // THE ONLY PLACE IN THE ENTIRE CODEBASE WHERE confidence_tier = 'verified' IS WRITTEN
      const result = await pool.query(
        `UPDATE atlas.passport_claims
         SET confidence_tier = 'verified',
             verified_at     = now(),
             verified_by     = $2,
             rejected        = false
         WHERE id = $1
         RETURNING *`,
        [claim_id, session.user.email ?? session.user.id],
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
      // action === 'note'
      const result = await pool.query(
        `UPDATE atlas.passport_claims
         SET user_note = $2
         WHERE id = $1
         RETURNING *`,
        [claim_id, note],
      );
      updatedClaim = result.rows[0];
    }

    return NextResponse.json({
      ok: true,
      action,
      claim_id,
      passport_id: claim.passport_id,
      claim: updatedClaim,
    });
  } finally {
    await pool.end();
  }
}

/**
 * GET /api/passport/verify-claim?claim_id=...
 * Returns current state of a single claim (for polling after verify/reject).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const claim_id = searchParams.get("claim_id");

  if (!claim_id) {
    return NextResponse.json(
      { error: "claim_id is required" },
      { status: 400 },
    );
  }

  const pool = getPassportPool();
  try {
    const result = await pool.query(
      `SELECT id, passport_id, claim_role, claim_domain, claim_text,
              conditions, confidence_tier, confidence_reason,
              source_document_id, source_excerpt,
              verified_at, verified_by, rejected, user_note, created_at
       FROM atlas.passport_claims
       WHERE id = $1`,
      [claim_id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    return NextResponse.json({ claim: result.rows[0] });
  } finally {
    await pool.end();
  }
}
