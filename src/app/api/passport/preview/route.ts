import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { extractClaimsFromDescription } from "@/lib/passport/claim-extractor";
import { getPassportPool } from "@/lib/passport/db";

/**
 * POST /api/passport/preview
 *
 * Extracts structured claims from a typed/spoken description and stores them
 * in atlas.pending_claim_batches WITHOUT writing to atlas.passport_claims.
 *
 * Accepts internal tool calls via x-tool-secret header.
 *
 * Body: { text: string, context_hint?: string }
 * Returns: { pending_batch_id, claims, source_text_length }
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
    text: string;
    context_hint?: string;
  };

  if (!body.text || body.text.length < 20) {
    return NextResponse.json(
      { error: "text must be at least 20 characters" },
      { status: 400 },
    );
  }

  const fullText = body.context_hint
    ? `Context: ${body.context_hint}\n\n${body.text}`
    : body.text;

  try {
    const claims = await extractClaimsFromDescription(fullText);

    const pool = getPassportPool();
    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO atlas.pending_claim_batches (claims, source_text)
         VALUES ($1::jsonb, $2)
         RETURNING id`,
        [JSON.stringify(claims), body.text.slice(0, 2000)],
      );

      return NextResponse.json({
        pending_batch_id: result.rows[0].id,
        claims,
        source_text_length: body.text.length,
      });
    } finally {
      await pool.end();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[passport/preview]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
