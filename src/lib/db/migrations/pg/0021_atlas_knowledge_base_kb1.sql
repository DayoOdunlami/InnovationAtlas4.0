-- KB-1 — Curated Knowledge Base migration (migration slot 0021).
-- Creates atlas.knowledge_documents and atlas.knowledge_chunks.
-- Slots 0019 and 0020 are reserved for Phase 3a and Phase 3b parallel
-- work; do NOT renumber or fill those here.
--
-- Schema design: docs/knowledge-base-plan.md §4.1 (Option C — sibling
-- tables inside atlas.*). Embedding dimension 1536 matches the rest of
-- the corpus (text-embedding-3-small). No new embedding model.
--
-- `modes` and `themes` arrays use GIN indexes; array-membership CHECK
-- constraints enforce the enumerated taxonomy without a join table.
-- `status` lifecycle: proposed → approved → retired; never hard-delete.

-- Ensure pgvector is enabled (idempotent; already present since 0017).
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE TABLE "atlas"."knowledge_documents" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title"        text NOT NULL,
  "source_type"  text NOT NULL CHECK ("source_type" IN (
                   'white_paper','policy_doc','govt_report',
                   'industry_report','guidance_doc','web_article','internal'
                 )),
  "source_url"   text,
  "storage_key"  text,
  "publisher"    text,
  "author"       text,
  "published_on" date,
  "modes"        text[] NOT NULL DEFAULT '{}',
  "themes"       text[] NOT NULL DEFAULT '{}',
  "lens_category_ids" uuid[] NOT NULL DEFAULT '{}',
  "tier"         text NOT NULL DEFAULT 'secondary'
                   CHECK ("tier" IN ('primary','secondary','tertiary')),
  "summary"      text,
  "status"       text NOT NULL DEFAULT 'proposed'
                   CHECK ("status" IN ('proposed','approved','retired')),
  "added_by"     uuid REFERENCES "public"."user"("id") ON DELETE SET NULL,
  "added_at"     timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_by"  uuid REFERENCES "public"."user"("id") ON DELETE SET NULL,
  "approved_at"  timestamp with time zone,
  "retired_at"   timestamp with time zone,
  "retired_reason" text,
  "chunks_refreshed_at" timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

CREATE TABLE "atlas"."knowledge_chunks" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "atlas"."knowledge_documents"("id") ON DELETE CASCADE,
  "chunk_index" int NOT NULL,
  "body"        text NOT NULL,
  "token_count" int NOT NULL DEFAULT 0,
  "embedding"   vector(1536),
  "created_at"  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunks_document_chunk_unique" UNIQUE ("document_id", "chunk_index")
);
--> statement-breakpoint

-- Btree index for fast document_id lookups on chunks.
CREATE INDEX "knowledge_chunks_document_id_idx"
  ON "atlas"."knowledge_chunks" USING btree ("document_id");
--> statement-breakpoint

-- IVFFlat index for approximate cosine similarity search on embeddings.
-- lists = 100 matches the hive.document_chunks convention.
CREATE INDEX "knowledge_chunks_embedding_ivfflat"
  ON "atlas"."knowledge_chunks" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
--> statement-breakpoint

-- Status index for fast approved-only retrieval (the tool's primary filter).
CREATE INDEX "knowledge_documents_status_idx"
  ON "atlas"."knowledge_documents" USING btree ("status");
--> statement-breakpoint

-- GIN indexes for array-containment queries (modes[] and themes[]).
CREATE INDEX "knowledge_documents_modes_idx"
  ON "atlas"."knowledge_documents" USING gin ("modes");
--> statement-breakpoint

CREATE INDEX "knowledge_documents_themes_idx"
  ON "atlas"."knowledge_documents" USING gin ("themes");
