#!/usr/bin/env tsx
/**
 * Writes src/lib/landscape/snapshot.ts using the same Postgres queries as
 * GET /api/landscape/v2-data (atlas.* via POSTGRES_URL — not Supabase REST,
 * which does not expose the atlas schema).
 *
 *   pnpm generate:landscape-snapshot
 *
 * Requires POSTGRES_URL or DATABASE_URL in .env / .env.local.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: join(process.cwd(), ".env") });
config({ path: join(process.cwd(), ".env.local") });

const { loadLandscapeGraphData } = await import(
  "../src/lib/landscape/load-landscape-graph-data"
);
const { getPassportPool } = await import("../src/lib/passport/pg-pool");

async function generate() {
  console.log("Querying Postgres (atlas schema)...");

  const pool = getPassportPool();
  let data;
  try {
    data = await loadLandscapeGraphData(pool);
  } finally {
    await pool.end();
  }

  const projectCount = data.nodes.filter((n) => n.type === "project").length;
  const liveCallCount = data.nodes.filter((n) => n.type === "live_call").length;
  const linkCount = data.links.length;

  if (projectCount < 600) {
    console.error(
      `ERROR: Expected ~622 projects with viz coords, got ${projectCount}. Check DB / filters.`,
    );
    process.exit(1);
  }

  console.log(
    `Projects: ${projectCount} | Live calls: ${liveCallCount} | Links: ${linkCount}`,
  );

  const { generatedAt, nodes, links } = data;
  const content = `// AUTO-GENERATED — do not edit by hand
// Run: pnpm generate:landscape-snapshot to rebaseline before demos
// Generated: ${generatedAt}
// Projects: ${projectCount} | Live calls: ${liveCallCount} | Nodes: ${projectCount + liveCallCount} | Links: ${linkCount}
//
// Frozen copy of GET /api/landscape/v2-data (same Postgres queries).
// Rebaseline after significant ingestion runs.

import type { LandscapeData } from "./types";

export const LANDSCAPE_SNAPSHOT: LandscapeData = ${JSON.stringify(
    { generatedAt, nodes, links },
    null,
    2,
  )}
`;

  const outPath = join(process.cwd(), "src/lib/landscape/snapshot.ts");
  writeFileSync(outPath, content, "utf8");
  const kb = Math.round(content.length / 1024);
  console.log(`Written: ${outPath} (${kb}KB)`);
  console.log("Run pnpm check-types to verify the file type-checks.");
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
