import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { runPassportMatching } from "@/lib/passport/matching";

/**
 * POST /api/passport/match
 *
 * Runs the full matching pipeline for a passport:
 *  1. Loads non-rejected claims from atlas.passport_claims
 *  2. Embeds combined claim text with text-embedding-3-small
 *  3. pgvector cosine similarity against atlas.projects (weighted by transport_relevance_score)
 *  4. pgvector cosine similarity against atlas.live_calls (open status only)
 *  5. Generates match_summary + evidence_map + gaps via Claude
 *  6. Writes/replaces rows in atlas.matches
 *
 * Body: { passport_id: string }
 * Returns: MatchingOutput
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let passport_id: string | undefined;
  try {
    const body = await req.json();
    passport_id = body?.passport_id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!passport_id) {
    return NextResponse.json(
      { error: "passport_id is required" },
      { status: 400 },
    );
  }

  try {
    const result = await runPassportMatching(passport_id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/passport/match] error:", message);
    return NextResponse.json(
      { error: "Matching failed", detail: message },
      { status: 500 },
    );
  }
}
