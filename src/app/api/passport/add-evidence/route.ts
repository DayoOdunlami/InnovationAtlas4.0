import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import {
  buildEmbedPayload,
  detectPassportClaimConflicts,
} from "@/lib/passport/claim-conflict";
import type { ExtractedClaim } from "@/lib/passport/claim-extractor";
import {
  getPassportPool,
  insertPassportClaimRow,
  updatePassportClaimEmbedding,
} from "@/lib/passport/db";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

type Resolution =
  | "kept_both"
  | "replaced"
  | "flagged_for_review"
  | "rejected_new";

/**
 * POST /api/passport/add-evidence
 *
 * Adds new evidence (claims) to an existing passport with conflict detection.
 * Accepts internal tool calls via x-tool-secret header.
 *
 * Body:
 *   passport_id        — existing passport UUID
 *   pending_batch_id   — UUID in atlas.pending_claim_batches
 *   conflict_resolutions? — [{incoming_claim_index, existing_claim_id, resolution}]
 *
 * Returns:
 *   status="conflicts_pending" with conflicts array (first call when conflicts found)
 *   status="saved" with claims_added count (when all conflicts resolved or none)
 */
export async function POST(request: Request) {
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
    passport_id: string;
    pending_batch_id: string;
    conflict_resolutions?: {
      incoming_claim_index: number;
      existing_claim_id: string;
      resolution: Resolution;
    }[];
  };

  const { passport_id, pending_batch_id, conflict_resolutions } = body;

  if (!passport_id || !pending_batch_id) {
    return NextResponse.json(
      { error: "passport_id and pending_batch_id are required" },
      { status: 400 },
    );
  }

  const pool = getPassportPool();

  try {
    const batchResult = await pool.query<{ claims: ExtractedClaim[] }>(
      `SELECT claims FROM atlas.pending_claim_batches WHERE id = $1`,
      [pending_batch_id],
    );
    if (!batchResult.rows[0]) {
      return NextResponse.json(
        { error: `pending_batch_id ${pending_batch_id} not found or expired` },
        { status: 404 },
      );
    }
    const claims = batchResult.rows[0].claims;

    if (claims.some((c) => c.confidence_tier === "verified")) {
      return NextResponse.json(
        {
          error:
            "CONFIDENCE CEILING VIOLATION: cannot write confidence_tier = 'verified'",
        },
        { status: 400 },
      );
    }

    const pRow = await pool.query<{ title: string }>(
      `SELECT COALESCE(title, project_name, 'Untitled') AS title FROM atlas.passports WHERE id = $1`,
      [passport_id],
    );
    if (!pRow.rows[0]) {
      return NextResponse.json(
        { error: `Passport ${passport_id} not found` },
        { status: 404 },
      );
    }
    const passportTitle = pRow.rows[0].title;

    const detected = await detectPassportClaimConflicts(
      pool,
      passport_id,
      claims,
    );

    const conflictIndexSet = new Set(
      detected.map((d) => d.incoming_claim_index),
    );

    if (detected.length > 0 && !conflict_resolutions?.length) {
      return NextResponse.json({
        status: "conflicts_pending",
        passport_id,
        passport_title: passportTitle,
        pending_batch_id,
        conflicts: detected.map((d) => ({
          incoming_claim_index: d.incoming_claim_index,
          existing_claim_id: d.existing_claim_id,
          similarity: d.similarity,
          similarity_method: d.similarity_method,
          incoming: d.incoming,
          existing: {
            claim_text: d.existing.claim_text,
            conditions: d.existing.conditions,
            confidence_tier: d.existing.confidence_tier,
            source_excerpt: d.existing.source_excerpt,
          },
        })),
        instructions:
          "Present existing vs incoming side by side. Ask the user to pick 1–4 for each pair. " +
          "Then call addEvidenceToPassport again with conflict_resolutions.",
      });
    }

    function conflictKey(i: number, eid: string) {
      return `${i}:${eid}`;
    }

    async function embedClaim(claimId: string, text: string): Promise<void> {
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: text,
      });
      await updatePassportClaimEmbedding(
        pool,
        claimId,
        `[${embedding.join(",")}]`,
      );
    }

    let claimsFromResolutions = 0;

    if (detected.length > 0 && conflict_resolutions) {
      const resByPair = new Map(
        conflict_resolutions.map((r) => [
          conflictKey(r.incoming_claim_index, r.existing_claim_id),
          r.resolution,
        ]),
      );

      for (const d of detected) {
        const res = resByPair.get(
          conflictKey(d.incoming_claim_index, d.existing_claim_id),
        );
        if (!res) {
          return NextResponse.json(
            {
              error: `Missing resolution for conflict: incoming index ${d.incoming_claim_index} vs existing ${d.existing_claim_id}`,
            },
            { status: 400 },
          );
        }
        const incoming = claims[d.incoming_claim_index];

        if (res === "rejected_new") {
          await pool.query(
            `UPDATE atlas.passport_claims SET conflict_resolution = $2 WHERE id = $1`,
            [d.existing_claim_id, "rejected_new"],
          );
          continue;
        }

        claimsFromResolutions++;

        if (res === "replaced") {
          const ins = await insertPassportClaimRow(pool, {
            passport_id,
            claim_role: incoming.claim_role,
            claim_domain: incoming.claim_domain,
            claim_text: incoming.claim_text,
            conditions: incoming.conditions ?? null,
            confidence_tier: incoming.confidence_tier,
            confidence_reason: incoming.confidence_reason,
            source_document_id: null,
            source_excerpt: incoming.source_excerpt,
            conflicting_claim_id: d.existing_claim_id,
            conflict_resolution: "replaced",
          });
          await pool.query(
            `UPDATE atlas.passport_claims
             SET rejected = true, conflicting_claim_id = $2, conflict_resolution = $3
             WHERE id = $1`,
            [d.existing_claim_id, ins.id, "replaced"],
          );
          await embedClaim(ins.id, buildEmbedPayload(incoming));
          continue;
        }

        if (res === "kept_both") {
          const ins = await insertPassportClaimRow(pool, {
            passport_id,
            claim_role: incoming.claim_role,
            claim_domain: incoming.claim_domain,
            claim_text: incoming.claim_text,
            conditions: incoming.conditions ?? null,
            confidence_tier: incoming.confidence_tier,
            confidence_reason: incoming.confidence_reason,
            source_document_id: null,
            source_excerpt: incoming.source_excerpt,
            conflicting_claim_id: d.existing_claim_id,
            conflict_resolution: "kept_both",
          });
          await pool.query(
            `UPDATE atlas.passport_claims
             SET conflicting_claim_id = $2, conflict_resolution = $3
             WHERE id = $1`,
            [d.existing_claim_id, ins.id, "kept_both"],
          );
          await embedClaim(ins.id, buildEmbedPayload(incoming));
          continue;
        }

        if (res === "flagged_for_review") {
          const ins = await insertPassportClaimRow(pool, {
            passport_id,
            claim_role: incoming.claim_role,
            claim_domain: incoming.claim_domain,
            claim_text: incoming.claim_text,
            conditions: incoming.conditions ?? null,
            confidence_tier: incoming.confidence_tier,
            confidence_reason: incoming.confidence_reason,
            source_document_id: null,
            source_excerpt: incoming.source_excerpt,
            conflicting_claim_id: d.existing_claim_id,
            conflict_resolution: "flagged_for_review",
          });
          await pool.query(
            `UPDATE atlas.passport_claims
             SET conflict_flag = true, conflicting_claim_id = $2, conflict_resolution = $3
             WHERE id = $1`,
            [d.existing_claim_id, ins.id, "flagged_for_review"],
          );
          await embedClaim(ins.id, buildEmbedPayload(incoming));
        }
      }
    }

    let inserted = 0;
    for (let i = 0; i < claims.length; i++) {
      if (conflictIndexSet.has(i)) continue;
      const c = claims[i];
      const ins = await insertPassportClaimRow(pool, {
        passport_id,
        claim_role: c.claim_role,
        claim_domain: c.claim_domain,
        claim_text: c.claim_text,
        conditions: c.conditions ?? null,
        confidence_tier: c.confidence_tier,
        confidence_reason: c.confidence_reason,
        source_document_id: null,
        source_excerpt: c.source_excerpt,
      });
      await embedClaim(ins.id, buildEmbedPayload(c));
      inserted++;
    }

    await pool.query(`DELETE FROM atlas.pending_claim_batches WHERE id = $1`, [
      pending_batch_id,
    ]);
    await pool.query(
      `UPDATE atlas.passports SET updated_at = now() WHERE id = $1`,
      [passport_id],
    );

    const claimsAdded = inserted + claimsFromResolutions;
    const conflictsResolved =
      detected.length > 0 && conflict_resolutions ? detected.length : 0;

    return NextResponse.json({
      status: "saved",
      passport_id,
      passport_title: passportTitle,
      claims_added: claimsAdded,
      conflicts_resolved: conflictsResolved,
      passport_url: `/passport/${passport_id}`,
      confirmation_message: `✓ ${claimsAdded} claims added to ${passportTitle}. ${conflictsResolved > 0 ? `${conflictsResolved} conflict(s) resolved` : "No conflicts"}. Matching will update your scores shortly.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[passport/add-evidence]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await pool.end();
  }
}
