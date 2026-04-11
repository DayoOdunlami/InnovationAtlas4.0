import { NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { getPassportPool, saveClaims } from "@/lib/passport/db";
import type { ExtractedClaim } from "@/lib/passport/claim-extractor";

/**
 * POST /api/passport/describe
 *
 * Creates a new passport (or uses an existing one) and saves a batch of
 * self-reported claims extracted from a typed or spoken description.
 *
 * Body:
 *   passport_id?     — use existing passport; if omitted, a new one is created
 *   pending_batch_id? — UUID in atlas.pending_claim_batches (preferred)
 *   claims?          — raw claims array (fallback if no batch_id)
 *   title?           — passport title (required when creating new)
 *   project_name?    — short name of the trial / product
 *   tags?            — string[]
 *   trial_date_start?
 *   trial_date_end?
 */
export async function POST(request: Request) {
  // Allow internal tool calls authenticated by BETTER_AUTH_SECRET header
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
    passport_id?: string;
    pending_batch_id?: string;
    claims?: ExtractedClaim[];
    title?: string;
    project_name?: string;
    tags?: string[];
    trial_date_start?: string;
    trial_date_end?: string;
  };

  const pool = getPassportPool();
  try {
    // ── Resolve claims ────────────────────────────────────────────────────────
    let claims: ExtractedClaim[] = [];

    if (body.pending_batch_id) {
      const batchResult = await pool.query<{ claims: ExtractedClaim[] }>(
        `SELECT claims FROM atlas.pending_claim_batches WHERE id = $1`,
        [body.pending_batch_id],
      );
      if (!batchResult.rows[0]) {
        return NextResponse.json(
          { error: `pending_batch_id ${body.pending_batch_id} not found` },
          { status: 404 },
        );
      }
      claims = batchResult.rows[0].claims;
      // Clean up the batch
      await pool.query(
        `DELETE FROM atlas.pending_claim_batches WHERE id = $1`,
        [body.pending_batch_id],
      );
    } else if (body.claims?.length) {
      claims = body.claims;
    } else {
      return NextResponse.json(
        { error: "Provide either pending_batch_id or claims[]" },
        { status: 400 },
      );
    }

    // Confidence ceiling guard
    if (claims.some((c) => c.confidence_tier === "verified")) {
      return NextResponse.json(
        {
          error:
            "CONFIDENCE CEILING VIOLATION: cannot write confidence_tier = 'verified' via describe",
        },
        { status: 400 },
      );
    }

    // ── Resolve or create passport ────────────────────────────────────────────
    let passportId: string = body.passport_id ?? "";
    let passportTitle: string = "";

    if (!passportId) {
      if (!body.title && !body.project_name) {
        return NextResponse.json(
          {
            error:
              "title or project_name required when creating a new passport",
          },
          { status: 400 },
        );
      }
      const title = body.title ?? body.project_name ?? "Untitled Passport";
      const newPassport = await pool.query<{ id: string; title: string }>(
        `INSERT INTO atlas.passports
           (title, project_name, user_id, tags, trial_date_start, trial_date_end)
         VALUES ($1, $2, $3, $4, $5::date, $6::date)
         RETURNING id, COALESCE(title, project_name, 'Untitled') AS title`,
        [
          title,
          body.project_name ?? null,
          session?.user?.id ?? null,
          body.tags ?? [],
          body.trial_date_start ?? null,
          body.trial_date_end ?? null,
        ],
      );
      passportId = newPassport.rows[0].id;
      passportTitle = newPassport.rows[0].title;
    } else {
      // Update metadata if supplied
      const existing = await pool.query<{ title: string }>(
        `UPDATE atlas.passports
         SET
           project_name     = COALESCE($2, project_name),
           tags             = COALESCE($3, tags),
           trial_date_start = COALESCE($4::date, trial_date_start),
           trial_date_end   = COALESCE($5::date, trial_date_end),
           updated_at       = now()
         WHERE id = $1
         RETURNING COALESCE(title, project_name, 'Untitled') AS title`,
        [
          passportId,
          body.project_name ?? null,
          body.tags ?? null,
          body.trial_date_start ?? null,
          body.trial_date_end ?? null,
        ],
      );
      if (!existing.rows[0]) {
        return NextResponse.json(
          { error: `Passport ${passportId} not found` },
          { status: 404 },
        );
      }
      passportTitle = existing.rows[0].title;
    }

    // ── Save claims ───────────────────────────────────────────────────────────
    const saved = await saveClaims(pool, passportId, claims, null);

    // Bump updated_at on the passport
    await pool.query(
      `UPDATE atlas.passports SET updated_at = now() WHERE id = $1`,
      [passportId],
    );

    return NextResponse.json({
      passport_id: passportId,
      passport_title: passportTitle,
      claims_saved: saved.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[passport/describe]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await pool.end();
  }
}
