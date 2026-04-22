-- Phase 2a.0, Brief-First Rebuild — atlas.blocks table migration.
-- The CHECK constraint encodes all nine v1 block types (Block Types
-- Spec §1) even though only `heading` and `paragraph` render in this
-- phase. `source` stays at the two-value v1 union; Data Model Spec
-- #15 adds 'voice' later — do not extend the CHECK in this phase.
-- `id` is a client-generated 26-char ULID string (Data Model Spec §3).
CREATE TABLE "atlas"."blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"brief_id" uuid NOT NULL,
	"type" text NOT NULL,
	"position" text NOT NULL,
	"content_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"canonical_question_ids" text[] DEFAULT '{}'::text[],
	"comments_json" jsonb DEFAULT '[]'::jsonb,
	CONSTRAINT "blocks_id_ulid_len_chk" CHECK (char_length("atlas"."blocks"."id") = 26),
	CONSTRAINT "blocks_type_chk" CHECK ("atlas"."blocks"."type" IN ('heading','paragraph','bullets','citation','project-card','chart','live-passport-view','landscape-embed','table')),
	CONSTRAINT "blocks_source_chk" CHECK ("atlas"."blocks"."source" IN ('user','agent'))
);
--> statement-breakpoint
ALTER TABLE "atlas"."blocks" ADD CONSTRAINT "blocks_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "atlas"."briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_brief_id_position" ON "atlas"."blocks" USING btree ("brief_id","position");--> statement-breakpoint
CREATE INDEX "blocks_type_idx" ON "atlas"."blocks" USING btree ("type");