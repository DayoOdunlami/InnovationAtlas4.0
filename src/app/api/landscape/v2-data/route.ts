import { loadLandscapeGraphData } from "@/lib/landscape/load-landscape-graph-data";
import type { LandscapeData } from "@/lib/landscape/types";
import { getPassportPool } from "@/lib/passport/pg-pool";
import { getSession } from "lib/auth/server";
import { NextResponse } from "next/server";

export const revalidate = 300;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pool = getPassportPool();
  try {
    const body: LandscapeData = await loadLandscapeGraphData(pool);
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=300" },
    });
  } finally {
    await pool.end();
  }
}
