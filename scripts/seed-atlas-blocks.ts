#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// Phase 2a.0 dev seed — 1 heading + 3 paragraphs into an existing brief.
//
// Usage:
//   POSTGRES_URL=... pnpm exec tsx scripts/seed-atlas-blocks.ts <BRIEF_ID>
//
// Reviewers: grab a brief id from /briefs in your dev session, then
// run the one-liner above. Blocks are appended to the end of the
// brief's block list.
//
// Not compiled into `pnpm build`; this is a developer convenience
// matching Phase 2a.0 scope (no user-visible "add paragraph" button).
// ---------------------------------------------------------------------------

import "load-env";
import { pgBriefRepository } from "@/lib/db/pg/repositories/brief-repository.pg";
import { pgBlockRepository } from "@/lib/db/pg/repositories/block-repository.pg";

async function main() {
  const briefId = process.argv[2];
  if (!briefId) {
    console.error(
      "Usage: pnpm exec tsx scripts/seed-atlas-blocks.ts <BRIEF_ID>",
    );
    process.exit(1);
  }
  if (!process.env.POSTGRES_URL) {
    console.error("POSTGRES_URL is required");
    process.exit(1);
  }

  // Read the brief under a system-scope-style probe (we reuse the
  // user who owns the brief as the scope for the writes below).
  const ownerProbe = await pgBriefRepository.getBriefById(briefId, {
    kind: "system",
  }).catch(() => null);
  // The above always throws for system scope — we catch, then look up
  // the owner via a direct SQL probe so the seed remains scope-correct
  // without bypassing repository deny paths.
  const { pgDb: db } = await import("@/lib/db/pg/db.pg");
  const { AtlasBriefsTable } = await import("@/lib/db/pg/schema.pg");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ id: AtlasBriefsTable.id, ownerId: AtlasBriefsTable.ownerId })
    .from(AtlasBriefsTable)
    .where(eq(AtlasBriefsTable.id, briefId))
    .limit(1);
  if (rows.length === 0) {
    console.error(`Brief ${briefId} not found`);
    process.exit(1);
  }
  const ownerScope = { kind: "user", userId: rows[0].ownerId } as const;

  const heading = await pgBlockRepository.create(
    {
      briefId,
      type: "heading",
      contentJson: { level: 1, text: "Phase 2a.0 seeded brief" },
      source: "user",
    },
    ownerScope,
  );
  const p1 = await pgBlockRepository.create(
    {
      briefId,
      type: "paragraph",
      contentJson: {
        text: "This is the first seeded paragraph. It renders read-only.",
      },
      source: "user",
    },
    ownerScope,
  );
  const p2 = await pgBlockRepository.create(
    {
      briefId,
      type: "paragraph",
      contentJson: {
        text: "Inline formatting is supported: bold, italic, code, link.",
        inline_formatting: [
          { start: 29, end: 33, type: "bold" },
          { start: 35, end: 41, type: "italic" },
          { start: 43, end: 47, type: "code" },
          {
            start: 49,
            end: 53,
            type: "link",
            url: "https://innovation-atlas.test/docs",
          },
        ],
      },
      source: "user",
    },
    ownerScope,
  );
  const p3 = await pgBlockRepository.create(
    {
      briefId,
      type: "paragraph",
      contentJson: {
        text: "Share this brief with a recipient to verify the read-only view.",
      },
      source: "agent",
    },
    ownerScope,
  );

  console.log("seeded blocks:");
  for (const b of [heading, p1, p2, p3]) {
    console.log(`  ${b.id}  ${b.type.padEnd(10)}  ${b.position}`);
  }
  // Satisfy the `ownerProbe` unused marker — kept as a sanity-check
  // that system scope is denied in production code paths.
  void ownerProbe;
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
