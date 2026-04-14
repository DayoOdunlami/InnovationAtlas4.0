import { NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { getPassportPool } from "@/lib/passport/db";

export type LandscapeProject = {
  id: string;
  title: string;
  lead_funder: string | null;
  funding_amount: number | null;
  viz_x: number;
  viz_y: number;
  transport_relevance_score: number | null;
  status: string | null;
  abstract: string | null;
  cpc_modes: string | null;
  source_url: string | null;
};

export type LandscapeLiveCall = {
  id: string;
  title: string;
  funder: string | null;
  funding_amount: string | null;
  viz_x: number;
  viz_y: number;
  status: string;
  deadline: string | null;
  source_url: string | null;
  description: string | null;
};

export type LandscapeData = {
  projects: LandscapeProject[];
  liveCalls: LandscapeLiveCall[];
};

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = getPassportPool();
  try {
    const [projectsResult, liveCallsResult] = await Promise.all([
      pool.query<LandscapeProject>(
        `SELECT id, title, lead_funder, funding_amount, viz_x, viz_y,
                transport_relevance_score, status, abstract, cpc_modes,
                source_url
         FROM atlas.projects
         WHERE viz_x IS NOT NULL AND viz_y IS NOT NULL
         ORDER BY id`,
      ),
      pool.query<LandscapeLiveCall>(
        `SELECT id, title, funder, funding_amount::text, viz_x, viz_y, status,
                deadline::text, source_url, description
         FROM atlas.live_calls
         WHERE viz_x IS NOT NULL AND viz_y IS NOT NULL`,
      ),
    ]);

    return NextResponse.json({
      projects: projectsResult.rows,
      liveCalls: liveCallsResult.rows,
    } satisfies LandscapeData);
  } finally {
    await pool.end();
  }
}
