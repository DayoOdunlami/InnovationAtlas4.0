#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// Caching-calibration probe — brief + message + share-token + block reads.
//
// Extended in Phase 2a.0 (Rec 4 from the Phase 1 caching calibration)
// to insert a tunable block payload (`CALIBRATION_BLOCK_COUNT`) and
// time `pgBlockRepository.listByBrief`. This gives us the numbers that
// `docs/phase-2a0-caching-followup.md` references.
//
// Measures the per-call latency of the three hot read paths the Phase 1
// surface hits on every request:
//
//   1. pgBriefRepository.listBriefsForUser  (hit on every /briefs load)
//   2. pgBriefRepository.getBriefById       (hit on every /brief/[id] load)
//   3. pgMessageRepository.listMessagesByBriefId (hit on every /brief/[id]
//      load, once the brief has any history)
//   4. pgBriefShareTokenRepository.findActiveByToken (hit on every
//      share-scope /brief/[id] load)
//
// The script creates a throwaway user + brief + N messages + share
// token, takes two passes across the four reads, and prints a small
// table. The first pass is the "cold" baseline; the second is the
// "warm" pass (Postgres shared_buffers + drizzle connection pool
// already warm).
//
// This is NOT a microbenchmark — we just want ballpark numbers for the
// Phase 1 caching calibration report (docs/phase-1-caching-calibration.md)
// to argue where an application-level cache would actually help before
// Phase 2a.0 starts loading more reads per request.
//
// Usage:
//   POSTGRES_URL=... pnpm exec tsx scripts/caching-calibration/measure-brief-reads.ts
// ---------------------------------------------------------------------------

import "load-env";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { inArray } from "drizzle-orm";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import {
  AtlasBlocksTable,
  AtlasBriefShareTokensTable,
  AtlasBriefsTable,
  AtlasMessagesTable,
  UserTable,
} from "@/lib/db/pg/schema.pg";
import { pgBlockRepository } from "@/lib/db/pg/repositories/block-repository.pg";
import { pgBriefRepository } from "@/lib/db/pg/repositories/brief-repository.pg";
import { pgBriefShareTokenRepository } from "@/lib/db/pg/repositories/brief-share-token-repository.pg";
import { pgMessageRepository } from "@/lib/db/pg/repositories/message-repository.pg";

const MESSAGE_COUNT = Number(process.env.CALIBRATION_MESSAGE_COUNT ?? 50);
const BLOCK_COUNT = Number(process.env.CALIBRATION_BLOCK_COUNT ?? 0);
const SUFFIX = randomUUID().slice(0, 8);
const EMAIL = `phase1-calibration-${SUFFIX}@innovation-atlas-test.local`;

interface Sample {
  label: string;
  cold: number;
  warm: number;
}

async function time<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const out = await fn();
  const elapsed = performance.now() - start;
  return [out, elapsed];
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error(
      "POSTGRES_URL is required. Skipping calibration — this script is read-only but the DB connection is mandatory.",
    );
    process.exit(1);
  }

  console.log(`# Caching calibration (suffix ${SUFFIX})`);
  console.log(`# messages per brief: ${MESSAGE_COUNT}`);
  console.log(`# blocks per brief:   ${BLOCK_COUNT}`);

  const [owner] = await db
    .insert(UserTable)
    .values({ email: EMAIL, name: "Phase 1 Calibration" })
    .returning();
  const ownerId = owner.id;
  const briefIds: string[] = [];
  const tokenIds: string[] = [];

  try {
    const brief = await pgBriefRepository.createBrief(
      { ownerId, title: `calibration ${SUFFIX}` },
      { kind: "user", userId: ownerId },
    );
    briefIds.push(brief.id);

    for (let i = 0; i < MESSAGE_COUNT; i += 1) {
      await pgMessageRepository.appendMessage(
        brief.id,
        {
          role: i % 2 === 0 ? "user" : "assistant",
          contentJson: {
            parts: [{ type: "text", text: `calibration message ${i}` }],
          },
        },
        { kind: "user", userId: ownerId },
      );
    }

    for (let i = 0; i < BLOCK_COUNT; i += 1) {
      await pgBlockRepository.create(
        {
          briefId: brief.id,
          type: i % 5 === 0 ? "heading" : "paragraph",
          contentJson:
            i % 5 === 0
              ? { level: 2, text: `Section ${i / 5 + 1}` }
              : {
                  text: `Paragraph #${i}. This is a calibration block used to stress the block-list fetch path at N=${BLOCK_COUNT}.`,
                },
          source: i % 2 === 0 ? "user" : "agent",
        },
        { kind: "user", userId: ownerId },
      );
    }

    const tokenRow = await pgBriefShareTokenRepository.mintToken(
      brief.id,
      { kind: "user", userId: ownerId },
    );
    tokenIds.push(tokenRow.id);
    const sharedToken = tokenRow.token;

    const probes: Array<{ label: string; run: () => Promise<unknown> }> = [
      {
        label: "listBriefsForUser",
        run: () =>
          pgBriefRepository.listBriefsForUser(ownerId, {
            kind: "user",
            userId: ownerId,
          }),
      },
      {
        label: "getBriefById (user)",
        run: () =>
          pgBriefRepository.getBriefById(brief.id, {
            kind: "user",
            userId: ownerId,
          }),
      },
      {
        label: `listMessagesByBriefId (n=${MESSAGE_COUNT})`,
        run: () =>
          pgMessageRepository.listMessagesByBriefId(brief.id, {
            kind: "user",
            userId: ownerId,
          }),
      },
      {
        label: "findActiveByToken",
        run: () => pgBriefShareTokenRepository.findActiveByToken(sharedToken),
      },
      {
        label: `block-repository.listByBrief (n=${BLOCK_COUNT})`,
        run: () =>
          pgBlockRepository.listByBrief(brief.id, {
            kind: "user",
            userId: ownerId,
          }),
      },
      {
        label: "/brief fetch fan-out (brief + messages + blocks)",
        run: async () => {
          await Promise.all([
            pgBriefRepository.getBriefById(brief.id, {
              kind: "user",
              userId: ownerId,
            }),
            pgMessageRepository.listMessagesByBriefId(brief.id, {
              kind: "user",
              userId: ownerId,
            }),
            pgBlockRepository.listByBrief(brief.id, {
              kind: "user",
              userId: ownerId,
            }),
          ]);
        },
      },
    ];

    const samples: Sample[] = [];
    for (const probe of probes) {
      const [, cold] = await time(probe.run);
      const [, warm] = await time(probe.run);
      samples.push({ label: probe.label, cold, warm });
    }

    console.log("\n| Probe                                    |   Cold (ms) |   Warm (ms) |");
    console.log("|------------------------------------------|-------------|-------------|");
    for (const s of samples) {
      const label = s.label.padEnd(40, " ");
      console.log(
        `| ${label} | ${s.cold.toFixed(1).padStart(11, " ")} | ${s.warm.toFixed(1).padStart(11, " ")} |`,
      );
    }
  } finally {
    if (tokenIds.length > 0) {
      await db
        .delete(AtlasBriefShareTokensTable)
        .where(inArray(AtlasBriefShareTokensTable.id, tokenIds));
    }
    if (briefIds.length > 0) {
      await db
        .delete(AtlasBlocksTable)
        .where(inArray(AtlasBlocksTable.briefId, briefIds));
      await db
        .delete(AtlasMessagesTable)
        .where(inArray(AtlasMessagesTable.briefId, briefIds));
      await db
        .delete(AtlasBriefsTable)
        .where(inArray(AtlasBriefsTable.id, briefIds));
    }
    await db.delete(UserTable).where(inArray(UserTable.id, [ownerId]));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
