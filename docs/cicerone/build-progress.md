# CICERONE Phase 2 — Build Progress Log

**Operator:** Cursor Cloud Agent (Linux)
**Branch:** `cursor/cicerone-phase2-stages-2_5-to-8-14a0`
**Base:** `origin/main` @ `d54cedb`
**Started:** 2026-04-29 11:11 UTC
**Reference DB:** Supabase project `afysgjiczzptubonbuxs` (InnovationAtlas, eu-west-1)

---

## Pre-flight — Clone-state verification

**Time:** 2026-04-29 11:12 UTC

### Repo state on clone

The cloud agent operates from a fresh `git clone` of
`DayoOdunlami/InnovationAtlas4.0` (origin/main). The CICERONE
local files referenced in the prompt — `docs/cicerone/`,
`StaggingFiles/`, `.tmp/stage2_4_documents_2_5.py` — were
authored locally on Dayo's Windows machine and **were not
committed to the remote**. They are absent from every branch
on origin (verified by enumerating all 17 remote branches).

This is a load-bearing constraint for Stages 2.5 and 2.6,
which require:

- `docs/cicerone/demo-evidence-packs/cicerone-pack-{1..4}.md`
  (canonical YAML for 5 demo passports + 26-30 claims + 6 gaps)
- `StaggingFiles/testbeds_metadata_augmented_v6 - Copy.xlsx`
  (~97-row testbed inventory)
- `.tmp/stage2_4_documents_2_5.py` (the ingestion pattern)

All three are missing. The Stage 2.4 *outputs* (tier briefs,
source documents, source chunks, embeddings) are present in
Supabase, so the database is in the expected post-Stage-2.4
state — but the source files needed to drive Stages 2.5 and
2.6 are not.

### Database state on clone (verified by SQL)

```text
tier_briefs        rows=3   embedded=3
source_documents   rows=5   (FAQ.source_type='internal' ✓ — already correct)
source_chunks      rows=24  embedded=24
testbeds           rows=0   embedded=0
demo_passports     rows=0   embedded=0
demo_claims        rows=0
demo_gaps          rows=0
demo_matches       rows=0
```

`atlas_demo` schema exists with `is_demo` column on `passports`.
All four CICERONE schemas (`atlas_demo`, `cicerone_kb` plus
the existing `atlas` and `auth`) are present and queryable.

The FAQ document already has `source_type='internal'`, so the
single-row UPDATE called for in the failure-philosophy section
is unnecessary on this clone. Logged as already-correct, no
change made, no decision-log entry warranted (this is trivia).

### Tier briefs exist and are substantive

```text
tier_briefs.body length:
  tier 1: 14 277 chars (Atlas Self-Knowledge)
  tier 2: 15 257 chars (D&D Context)
  tier 3: 12 699 chars (The Honest Delta)
```

All three briefs are richly written in CICERONE's intended
voice with real corpus numbers. They are the load-bearing
substrate for Stages 3, 5, 7, 8.

### Decision: continue past Stage 2.5/2.6 deferral

The failure philosophy is explicit: *"Stage 2.5 FK resolution
genuinely impossible (passport UUIDs not capturable from
inserts) → catastrophic"* but is silent on missing source
files. The agent's reading: missing source files is upstream
of FK resolution and harder to recover from in this
environment than catastrophic-by-spec failures, BUT the spec
is also clear that "we can rebuild completely in another
sprint" if anything is materially broken.

The right call is to:

1. Defer Stages 2.5 and 2.6 explicitly (document, do not fake).
2. Verify what *does* exist (Stage 2.7 against the actual DB).
3. Build CICERONE end-to-end against the existing Tier briefs
   and source documents (Stages 3-8). This is the demonstrable
   value that can be delivered honestly.
4. CICERONE's system prompt is updated to acknowledge the
   missing demo packs and missing testbed inventory in its
   capability self-description, so it does not over-promise.
5. The arrival document (Stage 8a) and the build-supplement
   (final) record this gap prominently.

This preserves the failure-philosophy invariant: weakness is
data, not failure. The agent cannot synthesise canonical
Sarah-scenario YAML without the source files, and inventing
content would violate "Never invent answers" and
"Source material is source of truth." The demo packs would
become hallucinated Atlas/D&D doctrine, which is the
load-bearing thing CICERONE must not do.

