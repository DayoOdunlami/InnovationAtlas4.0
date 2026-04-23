# Task: KB-1 — Curated Knowledge Base (kb-document source type)

## Repo & branch

- Repo: `DayoOdunlami/InnovationAtlas4.0`
- Branch off: `main` (currently at tag `phase-2b-close`, sha `a13d1a9`)
- Create branch: `feat/kb-1-knowledge-base`
- Open a PR when done with title: `feat(kb): Curated Knowledge Base — atlas.knowledge_* tables + surfaceKnowledgeBase tool`

## Migration slot reserved for you

Use **`0021_atlas_knowledge_base_kb1.sql`**. Do **NOT** use 0019 or 0020 — those are reserved for sibling parallel work (Phase 3a and Phase 3b).

## Mission

Implement the **concrete storage + retrieval + taxonomy plan** for the `kb-document` citation source type already named in #16 Evidence Source Model §5.2. This is the data layer for the missing "thematic grounding" in Atlas. The pattern is proven (HIVE does this for climate adaptation); this extends it without touching HIVE.

Deliverables:

1. **Two new tables** via migration `0021_atlas_knowledge_base_kb1.sql`:
   - `atlas.knowledge_documents` — admin-curated document registry.
   - `atlas.knowledge_chunks` — embedded chunks with `embedding vector(1536)`, FK back to documents.
2. **Drizzle schema updates** in `src/lib/db/pg/schema.pg.ts` — mirror the two tables.
3. **Repository** — `src/lib/db/pg/repositories/knowledge-repository.pg.ts` with `AccessScope` support (read is universal, write is admin-only). Pattern: follow `brief-repository.pg.ts`.
4. **Embed pipeline** — new script `scripts/embed_knowledge_documents.py` or TS equivalent; follows the shape of existing `scripts/embed_live_calls.py`, `scripts/embed_organisations.py`, `scripts/embed_lens_categories.py`.
5. **Agent tool** `surfaceKnowledgeBase({ query, modes?, themes?, topK? })` — registered in `src/lib/ai/tools/` under a new `kb/` sub-directory. Returns chunks with document provenance (title, source, URL, section, last_updated) so the model can cite inline. **Tier-labelled per HIVE's `src/lib/ai/prompts/hyve.ts` discipline** (primary-source / secondary / tertiary).
6. **Admin UI (minimal)** — a single `/admin/knowledge-base` page where admins can upload a PDF / text blob, set mode/theme tags, trigger embed. Reuse existing admin auth (`/admin/testing` pattern per `AGENTS.md`).
7. **Seed content** — **3 worked examples** (not the full 15–30) so the pipeline is proven end-to-end. Suggest: CP7 Network Rail strategic plan, DfT transport decarbonisation plan, ORR annual report 2024-25. Small PDFs fine for validation.

## Required context files to read

- `docs/knowledge-base-plan.md` — **read in full (~480 lines)**. This is your spec.
- `post-demo-backlog.md` — `KB-1 — Curated Knowledge Base` entry.
- `src/lib/ai/prompts/hyve.ts` — HIVE tier discipline. Your prompt template mirrors this.
- `src/lib/db/pg/schema.pg.ts` — existing atlas schema pattern (briefs, blocks, passports).
- `src/lib/db/pg/repositories/brief-repository.pg.ts` — `AccessScope` + repository pattern.
- `src/lib/ai/tools/**` — search for any existing `surface*` tool for the read-only tool pattern.
- `scripts/embed_organisations.py` — reference embed pipeline.
- `scripts/setup-atlas-storage.ts` — storage bucket pattern for uploaded PDFs.

## Schema design (from plan §4)

Quote `docs/knowledge-base-plan.md` §4 for exact columns. In particular:

- `atlas.knowledge_documents`:
  - `id uuid pk`
  - `title text not null`
  - `source_type text not null` (e.g. `strategy`, `regulation`, `research_paper`, `policy_doc`)
  - `published_at date`
  - `modes text[] not null` (transport modes)
  - `themes text[] not null` (climate, funding, safety, etc.)
  - `tier text not null check (tier in ('primary','secondary','tertiary'))`
  - `approved_by uuid` (fk users)
  - `approved_at timestamptz`
  - `storage_path text` (Supabase storage key)
  - `created_at / updated_at timestamptz`
- `atlas.knowledge_chunks`:
  - `id uuid pk`
  - `document_id uuid fk → atlas.knowledge_documents(id) on delete cascade`
  - `chunk_index int not null`
  - `content text not null`
  - `embedding vector(1536)`
  - `tokens int`
  - `created_at timestamptz`
  - Indexes: `btree (document_id)`, `ivfflat (embedding vector_cosine_ops)`

## Design constraints

1. **Read universe vs write admin-only:** reading KB is permitted for any `AccessScope`. Writing (document upload, re-embed, approve) is admin-only — reuse existing admin auth gate.
2. **No change to the frozen six-type citation union.** `kb-document` is already one of the six per #16 §5.2; your job is to power it, not extend it.
3. **Over-grounding bias guard:** per plan §5, if the KB query confidence is below a threshold (similarity < 0.3 for top-1), the tool returns `{ results: [], reason: "below_confidence_threshold" }` rather than weak chunks. This is explicit — test it.
4. **Telemetry:** new events `kb_surface_called` and `kb_surface_rejected` added to `src/lib/telemetry/envelope.ts` `ActionEventName` union. Payloads: `{ query_tokens, top_k, tier_counts, confidence }`.
5. **Scope fence — do NOT touch:**
   - `src/lib/db/pg/repositories/brief-repository.pg.ts`, `block-repository.pg.ts` (frozen contracts).
   - Existing migrations (`0000_*` through `0018_*`).
   - `src/proxy.ts`, `src/app/(brief)/**`, `src/components/canvas/**`, `src/components/landscape/**`.
   - `hive` schema — this is parallel, not replacement.

## Tests required

- **Unit:** repository CRUD with `AccessScope` (admin write / anon read, permit/deny).
- **Unit:** `surfaceKnowledgeBase` tool returns tier-labelled results; low-confidence rejection path; mode/theme filter correctness.
- **Integration (skipIf no POSTGRES_URL):** embed pipeline round-trip — seed 1 tiny doc, embed, query, assert retrieval.
- **Unit:** telemetry events emit with correct payloads.

## Gates

Run locally before PR:

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build:local`
- `pnpm db:migrate` (verify migration applies cleanly against a local DB)

## PR description must include

- Two tables created with columns listed.
- Embed pipeline: which script, how to run it, expected runtime for 1 doc.
- 3 seed docs listed (titles + source URLs).
- `surfaceKnowledgeBase` tool signature + 1 worked example (query → 2-3 tier-labelled results).
- Scope-fence attestation.
- Migration slot confirmed as `0021`.

## Out of scope

- Full 15–30 document seed (3 is enough to prove the pipeline; rest is a separate content PR).
- Wiring `surfaceKnowledgeBase` into brief-chat tool binding (that's a 2-line follow-up after this merges — add it to `briefing-tool-kit.ts`).
- HIVE changes (HIVE stays untouched).
- Admin UI polish — functional is enough for this PR.
