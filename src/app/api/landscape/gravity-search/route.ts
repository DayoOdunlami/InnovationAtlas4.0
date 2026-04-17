import { NextResponse } from "next/server";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { getSession } from "lib/auth/server";
import { getPassportPool } from "@/lib/passport/pg-pool";

type GravityRow = {
  id: string;
  similarity: number;
  node_type: string;
};

/**
 * POST /api/landscape/gravity-search
 *
 * Embeds the query and runs atlas.gravity_similarity_search.
 * Uses POSTGRES_URL (same pool as other landscape APIs) so the atlas schema
 * is reachable — Supabase RPC/PostgREST often lacks USAGE on atlas.*.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { query?: string };
  try {
    body = (await req.json()) as { query?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const pool = getPassportPool();
  try {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });
    if (!embedding?.length) {
      return NextResponse.json({ error: "embedding failed" }, { status: 500 });
    }

    const vectorStr = `[${embedding.join(",")}]`;

    const { rows } = await pool.query<GravityRow>(
      `SELECT id, similarity, node_type
       FROM atlas.gravity_similarity_search($1::vector(1536))`,
      [vectorStr],
    );

    const results = rows.map((r) => ({
      id: String(r.id),
      similarity: Number(r.similarity) || 0,
      node_type: r.node_type ?? "",
    }));

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[gravity-search] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
