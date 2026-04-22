-- Phase 1, Brief-First Rebuild — atlas.* Phase 1 migration.
-- The `atlas` schema was provisioned out-of-band for `atlas.passports`
-- and friends; `IF NOT EXISTS` keeps this migration idempotent on the
-- existing DB while also creating the schema on fresh environments.
CREATE SCHEMA IF NOT EXISTS "atlas";
--> statement-breakpoint
-- Required by `atlas.briefs.embedding VECTOR(1536)`. Idempotent; safe
-- on Supabase where the extension is whitelisted.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "atlas"."brief_share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "brief_share_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "atlas"."briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled brief' NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"agent_complete_snapshot_json" jsonb,
	"is_edited" boolean DEFAULT false NOT NULL,
	"shared_with" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"deleted_at" timestamp with time zone,
	"embedding" vector(1536),
	CONSTRAINT "briefs_title_len_chk" CHECK (char_length("atlas"."briefs"."title") <= 200)
);
--> statement-breakpoint
CREATE TABLE "atlas"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"transcript" boolean DEFAULT false NOT NULL,
	CONSTRAINT "messages_role_chk" CHECK ("atlas"."messages"."role" IN ('user','assistant','system','tool'))
);
--> statement-breakpoint
CREATE TABLE "atlas"."passport_share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "passport_share_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "atlas"."telemetry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"user_id_hash" text,
	"env" text NOT NULL,
	"category" text NOT NULL,
	"event" text NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ts" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "telemetry_events_category_chk" CHECK ("atlas"."telemetry_events"."category" IN ('nav','action','agent','perf'))
);
--> statement-breakpoint
ALTER TABLE "atlas"."brief_share_tokens" ADD CONSTRAINT "brief_share_tokens_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "atlas"."briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas"."briefs" ADD CONSTRAINT "briefs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas"."messages" ADD CONSTRAINT "messages_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "atlas"."briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- `atlas.passports` is provisioned out-of-band and is not modelled in
-- Drizzle, so the FK for passport_share_tokens.passport_id is declared
-- here via raw SQL. Matches Data Model Spec v1.1 §4.4.
ALTER TABLE "atlas"."passport_share_tokens" ADD CONSTRAINT "passport_share_tokens_passport_id_atlas_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "atlas"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atlas_brief_share_tokens_active_idx" ON "atlas"."brief_share_tokens" USING btree ("token") WHERE "atlas"."brief_share_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "atlas_briefs_owner_updated_idx" ON "atlas"."briefs" USING btree ("owner_id","updated_at" DESC NULLS LAST) WHERE "atlas"."briefs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "atlas_messages_brief_created_idx" ON "atlas"."messages" USING btree ("brief_id","created_at");--> statement-breakpoint
CREATE INDEX "atlas_passport_share_tokens_active_idx" ON "atlas"."passport_share_tokens" USING btree ("token") WHERE "atlas"."passport_share_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "atlas_telemetry_ts_idx" ON "atlas"."telemetry_events" USING btree ("ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "atlas_telemetry_cat_event_ts_idx" ON "atlas"."telemetry_events" USING btree ("category","event","ts" DESC NULLS LAST);