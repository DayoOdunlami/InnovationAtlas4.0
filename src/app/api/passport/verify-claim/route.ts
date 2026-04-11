import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { getPassportPool } from "@/lib/passport/db";
import { applyPassportClaimAction } from "@/lib/passport/claim-actions";

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
  // Allow internal tool calls (reject action only — verify requires user session)
  const toolSecret = request.headers.get("x-tool-secret");
  const isInternalCall =
    toolSecret &&
    toolSecret === process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_SECRET;

  const session = isInternalCall ? null : await getSession();
  if (!isInternalCall && !session?.user?.id) {
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

  // Internal tool calls may only reject/note — not verify (verify requires a human)
  if (isInternalCall && action === "verify") {
    return NextResponse.json(
      {
        error:
          "CONFIDENCE CEILING: only a human session can set confidence_tier = 'verified'",
      },
      { status: 403 },
    );
  }

  const pool = getPassportPool();

  try {
    const verifiedBy = session?.user?.email ?? session?.user?.id ?? "tool";
    const { claim: updatedClaim, passport_id } = await applyPassportClaimAction(
      pool,
      {
        claim_id,
        action,
        note,
        verified_by: verifiedBy,
      },
    );

    return NextResponse.json({
      ok: true,
      action,
      claim_id,
      passport_id,
      claim: updatedClaim,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "Claim not found") {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
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
              verified_at, verified_by, rejected, user_note, created_at,
              conflict_flag, conflicting_claim_id, conflict_resolution
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
