/**
 * Step 6: Creates the passport-documents Supabase Storage bucket (private)
 * and all missing atlas.* tables required for the passport pipeline.
 *
 * Run: pnpm tsx scripts/setup-atlas-storage.ts
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
);

const rawUrl = process.env.POSTGRES_URL!;
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function ensureBucket() {
  console.log("\n📦 Ensuring passport-documents bucket...");

  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === "passport-documents");

  if (exists) {
    console.log("  ✅ Bucket already exists");
    return;
  }

  const { error } = await supabase.storage.createBucket("passport-documents", {
    public: false,
    fileSizeLimit: 52428800, // 50 MB
    allowedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
  });

  if (error) throw new Error(`Failed to create bucket: ${error.message}`);
  console.log("  ✅ Created passport-documents bucket (private)");
}

async function ensureAtlasTables() {
  console.log("\n🗄️  Ensuring atlas schema tables...");

  const sql = `
    -- Passports
    CREATE TABLE IF NOT EXISTS atlas.passports (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      passport_type TEXT NOT NULL CHECK (passport_type IN (
        'evidence_profile','capability_profile',
        'requirements_profile','certification_record'
      )),
      title         TEXT NOT NULL,
      owner_org     TEXT,
      owner_name    TEXT,
      summary       TEXT,
      trl_level     INT,
      trl_target    INT,
      sector_origin TEXT[],
      sector_target TEXT[],
      embedding     vector(1536),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Passport documents
    CREATE TABLE IF NOT EXISTS atlas.passport_documents (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      passport_id       UUID NOT NULL REFERENCES atlas.passports(id) ON DELETE CASCADE,
      filename          TEXT NOT NULL,
      document_type     TEXT,
      uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at      TIMESTAMPTZ,
      processing_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (processing_status IN ('pending','processing','complete','failed')),
      claims_extracted  INT DEFAULT 0,
      storage_path      TEXT NOT NULL
    );

    -- Passport claims
    CREATE TABLE IF NOT EXISTS atlas.passport_claims (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      passport_id        UUID NOT NULL REFERENCES atlas.passports(id) ON DELETE CASCADE,
      claim_role         TEXT NOT NULL CHECK (claim_role IN ('asserts','requires','constrains')),
      claim_domain       TEXT NOT NULL CHECK (claim_domain IN (
        'capability','evidence','certification','performance','regulatory'
      )),
      claim_text         TEXT NOT NULL,
      conditions         TEXT,
      confidence_tier    TEXT NOT NULL DEFAULT 'ai_inferred'
        CHECK (confidence_tier IN ('verified','self_reported','ai_inferred')),
      confidence_reason  TEXT,
      source_document_id UUID REFERENCES atlas.passport_documents(id),
      source_excerpt     TEXT,
      verified_at        TIMESTAMPTZ,
      verified_by        TEXT,
      rejected           BOOLEAN NOT NULL DEFAULT false,
      user_note          TEXT,
      embedding          vector(1536),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Passport gaps
    CREATE TABLE IF NOT EXISTS atlas.passport_gaps (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      evidence_passport_id UUID NOT NULL REFERENCES atlas.passports(id) ON DELETE CASCADE,
      gap_description      TEXT NOT NULL,
      gap_type             TEXT NOT NULL CHECK (gap_type IN (
        'missing_evidence','trl_gap','sector_gap','certification_gap','conditions_mismatch'
      )),
      severity             TEXT NOT NULL CHECK (severity IN ('blocking','significant','minor'))
    );

    -- Matches
    CREATE TABLE IF NOT EXISTS atlas.matches (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      passport_id   UUID NOT NULL REFERENCES atlas.passports(id) ON DELETE CASCADE,
      project_id    UUID NOT NULL REFERENCES atlas.projects(id),
      match_score   FLOAT NOT NULL,
      match_summary TEXT,
      evidence_map  JSONB,
      gaps          JSONB
    );

    -- Match feedback
    CREATE TABLE IF NOT EXISTS atlas.match_feedback (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id      UUID NOT NULL REFERENCES atlas.matches(id) ON DELETE CASCADE,
      feedback_type TEXT NOT NULL CHECK (feedback_type IN (
        'clicked','pinned','dismissed','briefed','applied'
      ))
    );
  `;

  await pool.query(sql);
  console.log("  ✅ All atlas tables present");
}

async function main() {
  try {
    await ensureBucket();
    await ensureAtlasTables();
    console.log("\n✅ Step 6 storage setup complete\n");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
