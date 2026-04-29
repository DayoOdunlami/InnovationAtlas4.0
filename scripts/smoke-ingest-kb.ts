#!/usr/bin/env tsx
/**
 * Phase 3 smoke — upload local PDFs/DOCX to Supabase Storage at seed storage_key
 * paths, then ingest three approved documents (RSSB, Testbed Britain, UK Maritime).
 *
 * Prerequisites: .env with POSTGRES_URL, OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_KEY. Documents must be approved in admin UI.
 *
 * Usage:
 *   pnpm tsx scripts/smoke-ingest-kb.ts
 *   pnpm tsx scripts/smoke-ingest-kb.ts --skip-upload   # storage already populated
 */
import "load-env";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

import {
  findKnowledgeDocumentIdByTitle,
  ingestKnowledgeDocumentById,
} from "@/lib/kb/ingest-knowledge-document";

const BUCKET = "passport-documents";

const DEFAULT_UPLOADS: Array<{
  localPath: string;
  storageKey: string;
  contentType: string;
}> = [
  {
    localPath: String.raw`C:\Users\DayoOdunlami\Downloads\rssb-strategic-business-plan-2024-2029.pdf`,
    storageKey: "kb/rssb-strategic-business-plan-2024-2029.pdf",
    contentType: "application/pdf",
  },
  {
    localPath: String.raw`C:\Users\DayoOdunlami\Downloads\TESTBED-BRITAIN-130226 (1).pdf`,
    storageKey: "kb/testbed-britain-v1.0.pdf",
    contentType: "application/pdf",
  },
  {
    localPath: String.raw`C:\Users\DayoOdunlami\Downloads\Innovation Passports Second Level Plan V2.docx`,
    storageKey: "kb/innovation-passports-second-level-plan-v2.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
];

/** Order matches Phase 3 smoke spec: diverse formats + URL-only third doc. */
const SMOKE_TITLES = [
  "Testbed Britain: An Architecture for Scalable Innovation v1.0",
  "UK Maritime Decarbonisation Strategy",
  "RSSB Strategic Business Plan 2024-2029",
] as const;

async function uploadToSupabase(
  storageKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required for upload",
    );
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, buffer, {
      contentType,
      upsert: true,
    });
  if (error) {
    throw new Error(`Supabase upload failed (${storageKey}): ${error.message}`);
  }
  console.log(`  Uploaded → ${BUCKET}/${storageKey}`);
}

async function main() {
  const skipUpload = process.argv.includes("--skip-upload");

  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    console.error("POSTGRES_URL or DATABASE_URL required.");
    process.exit(1);
  }

  if (!skipUpload) {
    console.log("\n--- Upload local files to Supabase Storage ---\n");
    for (const u of DEFAULT_UPLOADS) {
      if (!fs.existsSync(u.localPath)) {
        console.warn(`  SKIP (missing file): ${u.localPath}`);
        continue;
      }
      const buf = fs.readFileSync(u.localPath);
      await uploadToSupabase(u.storageKey, buf, u.contentType);
    }
  } else {
    console.log("\n--- Skipping upload (--skip-upload) ---\n");
  }

  console.log("\n--- Ingest Phase 3 smoke documents ---\n");

  for (const title of SMOKE_TITLES) {
    const id = await findKnowledgeDocumentIdByTitle(title);
    if (!id) {
      console.error(`  NOT FOUND in DB: "${title}"`);
      continue;
    }
    console.log(`  Ingesting: ${title}`);
    try {
      const result = await ingestKnowledgeDocumentById(id);
      console.log(
        `    ✓ chunks=${result.chunkCount} format=${result.format} chars=${result.charCount}`,
      );
    } catch (e) {
      console.error(`    ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
