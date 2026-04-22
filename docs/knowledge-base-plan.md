# Curated Knowledge Base — plan

> Status: **captured, not building.** No code will be written against this
> plan until Brief-First Rebuild Phase 2b. The plan exists to (a) stop the
> idea being lost during Phase 1 execution, (b) lock in the design
> disciplines before implementation drift, and (c) flag the couplings to
> #16 Evidence Source Model, #7a Outcome Evals, #8 Performance &
> Telemetry, and the Composition Prompt Budget.
>
> **What this is precisely:** the concrete storage + retrieval + taxonomy
> + bias-governance plan for the `kb-document` citation source type
> *already named and frozen* in Phase 0 Deliverable #16 Evidence Source
> Model §5.2, and the `searchKB(query)` tool already named in #16 §7
> (renamed here to `surfaceKnowledgeBase` for naming-convention
> alignment with `surfaceResearch`). **No change to the frozen six-type
> citation union. No seventh source type.** This plan resolves #16 Open
> Question #1 (*"Curated KB documents: what's the list?"*) in shape;
> the exact document list still needs Dan / Domas / mode-lead approval.
>
> **Precedent in repo:** the `hive` schema + `src/lib/ai/prompts/hyve.ts`
> are a curated KB of DfT climate adaptation documents queried via a
> read-only `supabase-hive` MCP with tier-labelled citation discipline.
> The pattern is proven; this plan extends it to the rest of the Atlas
> domain without touching HIVE.
>
> **Backlog entry:** [`post-demo-backlog.md` → KB-1](../post-demo-backlog.md).
> **Notion proposal page:** [Proposed Feature — Curated Knowledge Base](https://www.notion.so/34ac9b382a748121ac02d0108db9722d).
> **Owner:** review and approve (or push back) before Phase 2b kickoff.

---

## 1. The gap this fills

Atlas today has two evidence classes at the agent's disposal:

1. **Structured entities** — `atlas.projects`, `atlas.live_calls`,
   `atlas.organisations`, `atlas.passports`. Queried via `supabase-atlas`.
2. **External research / web** — `surfaceResearch` (OpenAlex) and the
   web tool. Covers academic literature and current headlines.

It has **no thematic grounding layer**. When a user asks "what's the
CP8 envelope for rail decarbonisation?" or "what are the known
challenges in maritime autonomy?" or "how has DfT's freight strategy
evolved?", the agent either paraphrases training data (low trust, no
citation) or returns a projects-and-calls answer that doesn't address
the question. The same gap exists for every other mode × theme
combination where the answer lives in a policy doc, not in a funded
project row.

The curated knowledge base closes this gap by giving the agent ~15-30
admin-approved documents — primary-source strategy papers, regulator
annual reports, control-period documents, government plans — chunked,
embedded, and retrievable via a dedicated tool with provenance.

HIVE already does this for climate adaptation. The question is not
"does the pattern work?" — it does. The question is "how do we extend
it without breaking HIVE or polluting the `atlas.*` schema?".

---

## 2. Why capture now, not build now

**Couplings that make capture-before-Phase-1 worth the time:**

- **#16 Evidence Source Model** already lists `kb-document` as source
  type #2 (§5.2) and already names `searchKB(query)` as its retrieval
  tool (§7). Open Question #1 in §13 — *"Curated KB documents: what's
  the list?"* — is still live and blocks Phase 3a. Capturing now
  resolves that question in shape (target size, taxonomy, approval
  workflow, bias governance) without touching the frozen six-type
  union or the `citation` block schema.
- **#7a Outcome Evals** scores briefs against their own brief
  contract. `evidence-threshold` is one of the four contract fields.
  Without a knowledge base, thematic-question briefs will fail
  evidence-threshold systematically — and the eval-suite results will
  be misleading because the failure is a missing *feature*, not an
  agent regression.
- **Composition Prompt Budget + Phase 1 Caching Spike.** A
  `surfaceKnowledgeBase` tool description costs ~80-120 tokens at
  session start (inside the 6350-token session ceiling with room to
  spare). Retrieved chunks cost ~2400 tokens per invocation (6 chunks
  × ~400 tokens) from the per-turn budget, not the session ceiling —
  so no ceiling breach. But the Phase 1 caching calibration spike
  should include a retrieval-heavy variant so the four-currency budget
  assumptions hold up in realistic brief archetypes
  (evidence-synthesis, policy-context).

**Why not build now:**

- Phase 1 is foundation work — brief / block / message schema,
  repository-layer access control, telemetry scaffolding. A new data
  domain pollutes the scope fence.
- Phase 2a.0 introduces the first brief-writing agent. Too early;
  agents need to produce *any* block before they need to produce
  *well-grounded* blocks.
- Phase 2b is when agent output is evaluated against outcome evals.
  That is when thematic grounding starts to materially affect brief
  quality. This plan targets Phase 2b.

---

## 3. Schema — three paths, one preferred

### 3.1 Option A — Extend `hive.*` to be theme-agnostic
Keep `hive.articles` + `hive.document_chunks` + `hive.sources`; relax
the implicit "climate adaptation" convention; add `modes[]` / `themes[]`
columns.

- **Pros:** zero new tables, one schema, one MCP already works.
- **Cons:** HIVE is DfT-commissioned for climate adaptation specifically.
  Repurposing the schema risks stepping on that stakeholder relationship
  and blurring an external brand boundary.
- **Verdict:** avoid.

### 3.2 Option B — Parallel `library.*` schema
Mirror the HIVE shape under a new `library` schema with its own MCP
(`supabase-library`).

- **Pros:** clean separation, zero impact on HIVE.
- **Cons:** two MCPs (hive + library) the agent must reason about
  despite being structurally identical. Schema proliferation for no
  conceptual gain over Option C.
- **Verdict:** acceptable but not preferred.

### 3.3 Option C — Sibling tables inside `atlas.*` *(preferred)*
`atlas.knowledge_documents` + `atlas.knowledge_chunks` live alongside
`atlas.projects`, `atlas.live_calls`, etc. Queryable via the existing
`supabase-atlas` MCP, already wired into every agent.

- **Pros:** single MCP for atlas-domain knowledge. Reuses the existing
  vector-search infra, storage bucket conventions, embed scripts. The
  conceptual model is clean: *"Atlas is the platform domain; HIVE is
  the climate-adaptation domain."*
- **Cons:** ~200 lines of SQL shape duplication with `hive.*`.
  Acceptable — duplication is cheap; conceptual clarity is not.
- **Verdict:** **preferred.** The rest of this plan assumes Option C.

---

## 4. Minimal implementation (Option C)

### 4.1 Tables

```sql
CREATE TABLE atlas.knowledge_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  source_type       TEXT NOT NULL CHECK (source_type IN (
                      'white_paper','policy_doc','govt_report',
                      'industry_report','guidance_doc','web_article','internal'
                    )),
  source_url        TEXT,
  storage_key       TEXT,                       -- when uploaded as PDF
  publisher         TEXT,                       -- DfT, ORR, Network Rail, CPC, etc.
  author            TEXT,
  published_on      DATE,
  modes             TEXT[] NOT NULL DEFAULT '{}',
  themes            TEXT[] NOT NULL DEFAULT '{}',
  lens_category_ids UUID[] NOT NULL DEFAULT '{}', -- references atlas.lens_categories
  summary           TEXT,
  status            TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed','approved','retired')),
  added_by          UUID REFERENCES public."user"(id),
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by       UUID REFERENCES public."user"(id),
  approved_at       TIMESTAMPTZ,
  retired_at        TIMESTAMPTZ,
  retired_reason    TEXT,
  chunks_refreshed_at TIMESTAMPTZ
);

CREATE TABLE atlas.knowledge_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES atlas.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index  INT NOT NULL,
  body         TEXT NOT NULL,
  token_count  INT NOT NULL,
  embedding    VECTOR(1536) NOT NULL,
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX knowledge_chunks_embedding_ivfflat
  ON atlas.knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX knowledge_documents_status_idx ON atlas.knowledge_documents (status);
CREATE INDEX knowledge_documents_modes_idx  ON atlas.knowledge_documents USING GIN (modes);
CREATE INDEX knowledge_documents_themes_idx ON atlas.knowledge_documents USING GIN (themes);
```

Embedding dimension matches the rest of the corpus (`text-embedding-3-small`,
1536). No new embedding model.

### 4.2 Ingestion script

`scripts/embed_knowledge_documents.py` — mirrors `scripts/embed_live_calls.py`
and `scripts/embed_organisations.py` exactly. Steps per document:

1. Read rows from `atlas.knowledge_documents` where
   `status IN ('proposed','approved')` and `chunks_refreshed_at IS NULL
   OR chunks_refreshed_at < updated_at`.
2. If `storage_key` is set — download PDF from a new private Supabase
   Storage bucket `knowledge-documents` (shape copied from
   `scripts/setup-atlas-storage.ts`). Parse with `pdf-parse` / `unpdf`.
3. If `source_url` is set — fetch via the existing Firecrawl MCP,
   strip boilerplate (nav, footers, cookie banners).
4. Chunk at 800-1200 tokens with 100-token overlap — same convention
   as existing embed scripts.
5. Embed each chunk with `text-embedding-3-small` via the shared
   embeddings helper.
6. Delete existing chunks for the `document_id`, insert the new set,
   stamp `chunks_refreshed_at = NOW()`.

Idempotent. Resumable. Re-runs cheaply.

### 4.3 Tool

Follow the `surfaceResearch` shape exactly:

```ts
surfaceKnowledgeBase({
  query: string,
  modes?: ("rail" | "aviation" | "maritime" | "hit")[],
  themes?: ("autonomy" | "decarbonisation" | "people_experience"
    | "hubs_clusters" | "planning_operation" | "industry")[],
  limit?: number, // default 6, max 10
})
```

Returns:

```ts
{
  documents: Array<{
    document_id: string;
    title: string;
    publisher: string;
    published_on: string | null;
    source_type: string;
    chunks: Array<{
      chunk_index: number;
      body: string;
      similarity: number;
      token_count: number;
    }>;
  }>;
  coverageNote: "thin" | "adequate" | "strong";
  filtersApplied: { modes: string[]; themes: string[] };
}
```

Behaviour:

- Reads `status = 'approved'` rows only. Never `proposed`, never `retired`.
- `coverageNote = 'thin'` when fewer than 3 approved docs match the filter,
  `'strong'` when ≥10, `'adequate'` in between.
- Agent is prompt-bound to surface `'thin'` honestly ("my curated
  sources on maritime decarb are thin — the corpus and live web are
  stronger here"). Same discipline as the HYVE "HIVE coverage is thin"
  rule.

### 4.4 Prompt tier — ATLAS + JARVIS

Add a new tier between Atlas corpus and OpenAlex. Proposed wording:

> **Tier 1b — Curated Knowledge Base** — Rows in `atlas.knowledge_chunks`
> via `surfaceKnowledgeBase`. Cite as: *"From the Transport Knowledge
> Library — [document title, publisher, year]."* Query this when the
> user asks about policy, strategy, control periods, spending decisions,
> sector challenges, or thematic context that may not be in the
> projects-and-calls corpus. Do NOT use for funded-project counts (use
> supabase-atlas), academic findings (use surfaceResearch), or current
> headlines (use web search).

HYVE is a separate decision — the `hive` KB already plays this role
for climate adaptation. Mixing the two risks noise. Decide per-agent at
Phase 2b kickoff; default is *don't add to HYVE*.

### 4.5 Admin surface

`/admin/knowledge` — same shell as `/admin/testing`. Five pieces:

1. **Documents table.** Columns: status, modes, themes, publisher,
   added_by, added_at, chunk_count, chunks_refreshed_at, last-accessed.
2. **Add source form.** Paste URL OR upload PDF → auto-suggest
   modes/themes from title + first-chunk text → admin confirms →
   row enters `status = 'proposed'` → the embed job picks it up.
3. **Approval toggle.** `proposed → approved`, `approved → retired`.
   Never hard-delete. `retired_reason` required on retire.
4. **Coverage matrix panel.** modes × themes grid with approved-doc
   counts. Gaps are visible and actionable.
5. **Test-retrieval field.** Paste a sample query, see the top-6 chunks
   the tool would return. The single most useful debugging surface.

---

## 5. Bias governance (non-negotiable disciplines)

Three failure modes. Each mitigation must ship in the initial
implementation — not added later.

### 5.1 Over-grounding
**Failure:** 10 rail documents become the model's entire view of rail.
It stops querying `atlas.projects` or the web because the KB "already
said".
**Mitigations, all required together:**
- Tool-invoked only. Never auto-injected into system prompt or user
  turn. Agent chooses to call `surfaceKnowledgeBase` the same way it
  chooses `surfaceResearch`.
- Retrieval capped at 6 chunks, ~2500 tokens per invocation. Model
  sees excerpts, not full documents.
- Every chunk carries provenance in the answer ("per *DfT Rail
  Environment Policy Statement, 2023, p. 14…*"). The ATLAS "source
  discipline" rule extends to knowledge-base chunks verbatim.
- Prompt rule: if `supabase-atlas` contradicts `surfaceKnowledgeBase`,
  **surface the disagreement; do not smooth it away.** Mirrors the
  HYVE "layers disagree" rule.

### 5.2 Under-grounding (gap bias)
**Failure:** Rail has 12 approved docs, aviation has 2. Model sounds
confident about rail and vague about aviation without telling the user.
**Mitigations:**
- Admin UI surfaces the coverage matrix so gaps are visible.
- Tool returns `coverageNote: 'thin'` and the agent is prompt-bound to
  say so.
- Seed plan targets balanced coverage. Not perfectly balanced; honestly
  uneven.

### 5.3 Drift / staleness
**Failure:** CP7 becomes CP8. A 2018 strategy paper is superseded. The
model keeps citing stale context.
**Mitigations:**
- `status = 'retired'` — never hard-delete. Retrieval only reads
  `approved`.
- `published_on` on every document. Tool can rank by recency when the
  query mentions "current" / "latest".
- 6-month admin review cadence: docs not touched in 6 months surface
  on the admin coverage panel with a "review needed" flag.
- Tier-0 Trust & Safety gate (from #7a) includes a check that the
  agent never cites a `retired` document in a shipped brief.

---

## 6. Taxonomy discipline

**The single biggest design risk is free-form tagging.** Without
constraints, `modes[]` will accumulate typos, synonyms, and semantic
drift within months. The mitigation is to treat the enumerations as
hard-coded:

- `modes[]` values MUST be drawn from: `rail`, `aviation`, `maritime`,
  `hit`. Enforced either by CHECK constraint on array membership or by
  promoting to a join table with FK to a small reference table. The
  latter is more ceremonious but future-proofs adding a fifth mode.
- `themes[]` values MUST be drawn from: `autonomy`, `decarbonisation`,
  `people_experience`, `hubs_clusters`, `planning_operation`,
  `industry`.
- `lens_category_ids[]` is FK-shape to `atlas.lens_categories` — row
  existence already enforces validity.

The auto-suggest in the admin "Add source" form never invents a new
tag; it only suggests from the enumerated sets.

---

## 7. Couplings to existing specs

### 7.1 #16 Evidence Source Model → implements existing `kb-document` type
This plan is the concrete implementation of the `kb-document` source
type already named in #16 §5.2. The metadata schema defined there
(`documentId`, `chunkId`, `documentTitle`, `section`, `page`,
`publicationDate`, `publisher`, `sourceType_kb`) is respected verbatim
— the `atlas.knowledge_documents` / `atlas.knowledge_chunks` tables in
§4.1 populate those fields. The `sourceType_kb` enum
(`strategy`/`policy`/`framework`/`research-priority`) stays as-is; it
is orthogonal to the `modes` / `themes` filters introduced in §4.1 and
§6. **No change to #16's frozen six-type union.** The `searchKB(query)`
tool named in #16 §7 becomes `surfaceKnowledgeBase({ query, modes?,
themes?, limit? })` — a rename for naming-convention alignment with
`surfaceResearch`, not a behavioural change. This plan **resolves #16
Open Question #1** in shape; the exact document list still needs Dan /
Domas / mode-lead approval. **Phase placement moves from Phase 3a
(#16 §13 Q1 original) to Phase 2b** for the reasons in §2.

### 7.2 #3 Block Types Spec → no change
`citation` block remains frozen at the block-type level. No
`knowledge-document` block, no `library-embed` block. Rule 11
block-type freeze is preserved.

### 7.3 #7a Outcome Evals → Tier-1 contract-fidelity dependency
The brief contract's `evidence-threshold` field becomes meaningfully
testable only once knowledge-base grounding exists. Measuring
contract-fidelity on thematic-question briefs before the KB lands
produces systematic false-negatives. **#7a should note this
dependency** so early eval results are not misinterpreted.

### 7.4 #8 Performance & Telemetry → two new events
- `tool.surface_knowledge_base_called { document_count, chunk_count,
  coverage_note, filters_applied }` — measures invocation rate and
  coverage gaps in the wild. Feeds into the coverage matrix.
- `agent.knowledge_document_retired_cited { document_id, brief_id }` —
  caught by Tier-0 Trust & Safety gate. Blocks brief shipment.

### 7.5 Composition Prompt Budget → one per-turn entry
Tool description adds ~80-120 tokens at session start (inside the
6350-token ceiling with room to spare). Retrieved chunks cost ~2400
tokens per invocation from per-turn budget, not session budget. No
ceiling breach. Worth noting on the budget doc for completeness.

### 7.6 Phase 1 Caching Calibration Spike → one additional variant
Include a retrieval-heavy variant where `surfaceKnowledgeBase` is
invoked per turn, so cache-hit rates are measured under realistic
conditions for the KB-heavy archetypes (evidence-synthesis,
policy-context). Without this, the four-currency budget assumptions
may be optimistic for those archetypes. **This is the one Phase 1
change KB-1 asks for.**

---

## 8. Seed content — the hard part, not the code

Code is a week. Seed content is weeks of curator time. Target v1:

- ~5 documents per mode (rail, aviation, maritime, hit) × ~3 per theme
  (autonomy, decarbonisation, people_experience, hubs_clusters,
  planning_operation, industry) = **~30 approved documents**.
- Bias toward **primary sources with stable URLs**: government strategy
  papers, regulator annual reports, CP7/CP8 documents, ORR annual
  output, Network Rail strategic plans, DfT decarbonisation plan, UKRI
  transport strategy, CAA airspace modernisation.
- Each mode lead contributes their own *"if someone joined my team
  tomorrow, what would they read?"* list.

**This is not something one person can do alone.** The staffing plan
for Phase 2b must include curator time from mode leads, not just
developer time.

---

## 9. Three strategic decisions owed before build

Answers needed before code is written. Capturing now so the decisions
are ready at Phase 2b kickoff.

1. **Who curates?**
   - (i) Dayo only — fastest and most consistent; single point of failure.
   - (ii) Each mode lead curates their mode — best domain fit; slowest
     to stand up.
   - (iii) Open contribution with Dayo/admin approval — most scalable;
     most admin-UI work.
   - **Lean:** (iii) with (i) fallback to bootstrap v1.

2. **How do we seed v1?**
   - Minimum viable: ~15 documents, weighted to most-asked areas.
   - Target: ~30 documents, balanced across modes × themes.
   - Stretch: ~50 documents with coverage matrix ≥2 per cell.
   - **Lean:** start at ~15, grow to ~30 before Outcome Evals ship.

3. **Agent-invoked only, or user-browsable too?**
   - Agent-only: matches `surfaceResearch`. No user UI beyond admin.
     Simpler, faster.
   - User-browsable: a `/library` page with search / filters / document
     preview. Implies a second real UI and opens user-initiated flows
     ("show me what we have on rail autonomy").
   - **Lean:** agent-only for v1. Add browse in a later slice only if
     real user behaviour asks for it.

---

## 10. Execution sequence when Phase 2b kicks off

In strict order, one commit each:

1. **Schema migration** — `atlas.knowledge_documents` +
   `atlas.knowledge_chunks` + indexes + `knowledge-documents` storage
   bucket. ~50 lines SQL.
2. **Ingestion script** `scripts/embed_knowledge_documents.py` — URL +
   PDF paths. ~200 lines.
3. **Tool registration** `surfaceKnowledgeBase` + Zod schema + handler
   + `supabase-atlas` MCP SELECT permission verification. ~120 lines.
4. **Prompt tier** added to ATLAS + JARVIS (HYVE deferred).
5. **Admin page** `/admin/knowledge` — the five pieces from §4.5.
   ~500 lines React. Biggest single item.
6. **Seed load** — bulk-import ~15 initial documents.
7. **Telemetry events** wired into #8 (§7.4).
8. **#16 close-out** — confirm metadata-schema alignment with #16 §5.2
   (`documentId`, `chunkId`, `documentTitle`, `section`, `page`,
   `publicationDate`, `publisher`, `sourceType_kb`); close #16 Open
   Question #1 with the seeded document list. No source-type-union
   change; no `citation` block schema change.
9. **Eval wiring** — #7a Tier-1 contract-fidelity consumes
   `kb-document` citations in `evidence-threshold` scoring.

**Estimated duration:** 5-8 focused days across the commits. Admin UI
is the single largest line-count item. Seed curation runs in parallel
over 2-4 weeks.

---

## 11. What it is not

Pinned here because scope creep on feature captures is the usual way
~5-day implementations become ~3-week ones.

- **Not NotebookLM.** No interactive notebooks, no AI-generated audio
  summaries, no notes layer. A retrieval tool and an admin page.
- **Not a block type.** `citation` remains the only user-facing block
  that touches this feature. Block-type freeze is preserved.
- **Not a live sync.** Documents are manually curated. No scraper, no
  RSS, no auto-refresh. Admin pushes updates on their cadence.
- **Not user-uploaded content.** Unlike `atlas.passport_documents`
  (user-private), knowledge documents are admin-curated and
  organisation-wide. User uploads stay in the passport domain.
- **Not OpenAlex replacement.** `surfaceResearch` remains for
  peer-reviewed academic literature. The KB is for policy / strategy /
  sector reports. Complementary, not competing.
- **Not a HIVE replacement or rewrite.** HIVE keeps its schema, its MCP,
  its prompt tier. Two parallel KBs with clear domain boundaries.

---

## 12. Change log

- **v0.1 — 2026-04-21.** Captured during Phase 0 closeout / Phase 1
  brief v1.1 ratification. Context: user asked whether a NotebookLM-style
  KB makes sense for bolstering AI answers on thematic questions. Two
  external AI responses evaluated — one (Cursor) named HIVE as the
  precedent, one (Claude) named the three failure modes and placed the
  feature in Phase 2b. This doc synthesises both plus the coupling
  analysis to #16, #7a, #8, Composition Prompt Budget, and the Phase 1
  caching spike.
- **v0.2 — 2026-04-21 (same session).** Reframed from *"seventh citation
  source type"* to *"implementation plan for existing `kb-document`
  source type"* after re-reading #16 §5.2 + §7 + §13 Q1. `kb-document`
  is already in the frozen six-type union; `searchKB(query)` is already
  named as its tool. This plan's contribution is storage + retrieval +
  taxonomy + bias-governance shape, and it resolves #16 Open Question
  #1 in shape (not in content — document list still pending Dan /
  Domas / mode-lead approval). Phase placement moved from #16 §13 Q1's
  original Phase 3a to Phase 2b. No change to #3 Block Types Spec.
  Owner: review and approve (or push back) before Phase 2b kickoff.
