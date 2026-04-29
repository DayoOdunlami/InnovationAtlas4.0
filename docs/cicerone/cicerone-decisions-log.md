# CICERONE Decisions Log

Append-only. Semantic / schema / load-bearing decisions only.
Trivia (e.g. ASCII trim, snake_case names) goes elsewhere.

---

## 2026-04-29 11:12 UTC — Stage 2.5/2.6 deferral (missing source files)

**Decision:** Stages 2.5 (demo evidence packs) and 2.6 (testbed
inventory) are deferred. The repo on origin/main does not
contain the canonical pack markdown (`docs/cicerone/demo-evidence-packs/cicerone-pack-{1..4}.md`)
nor the testbed xlsx (`StaggingFiles/testbeds_metadata_augmented_v6 - Copy.xlsx`).
These were authored locally on Dayo's Windows machine and
never committed.

**Why this is a decision, not trivia:** Stages 2.5 and 2.6
populate the demo passport schema and the testbed inventory.
Without them, CICERONE has no Sarah scenario data to walk
through and no testbed lookups to perform. The agent could
have synthesised plausible-looking pack content, but that
would invert the entire principle of "Source material is
source of truth" and produce the exact failure mode the
Tier 1 brief warns against ("plausible-sounding falsehoods
that audiences cannot distinguish from grounded claims").

**What CICERONE will do instead:** Operate on the substantive
Tier 1/2/3 briefs and the 5 source documents that *are* in the
DB. Be explicit about the missing demo packs and testbeds in
its self-description so users do not ask for things it cannot
deliver.

**Recovery path:** A follow-up sprint where Dayo commits the
pack files and the xlsx unblocks Stages 2.5/2.6. The Python
ingestion pattern (`scripts/embed_knowledge_documents.py`,
`scripts/embed_atlas.py`, etc.) is well-established in the
repo, so the ingestion code itself is straightforward.

---

## 2026-04-29 11:12 UTC — CICERONE registered as a system prompt + agent example, not a separate API surface

**Decision:** CICERONE follows the ATLAS / HYVE pattern of being
a system prompt module exported from `src/lib/ai/prompts/`,
plus an `Agent` registration in `src/lib/ai/agent/example.ts`.
It does not get its own dedicated API route (the JARVIS
viewport endpoint is a special case for the vision modality;
CICERONE is conversational so it goes through the standard
chat route).

**Why:** Mirrors how ATLAS and the example agents are wired
in this codebase. Avoids inventing a new surface for
something that should be invoked the same way other agents
are invoked. Keeps the change minimal and reviewable.

---
