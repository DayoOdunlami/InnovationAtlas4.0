# CICERONE Build Status — On Return

**Operator preamble (human-readable, do not edit CICERONE's section below).**

The body of this document is what CICERONE wrote when asked to introduce
itself, describe what it can do, name the four demo packs, identify
limitations, and propose three things for Dayo to test. It is the
primary arrival document. Its honesty is the point.

| Stage  | Status                | Timestamp (UTC)         |
|--------|-----------------------|-------------------------|
| 2.5    | **Deferred**          | 2026-04-29 11:13        |
| 2.6    | **Deferred**          | 2026-04-29 11:13        |
| 2.7    | Complete              | 2026-04-29 11:14        |
| 3      | Complete + 5/5 smokes | 2026-04-29 11:35        |
| 4      | Complete (4 of 4)     | 2026-04-29 11:39        |
| 5      | Complete + Demo handoff | 2026-04-29 11:25      |
| 6      | Minimal (in-prompt)   | 2026-04-29 11:25        |
| 7      | 5 HOLDS / 0 SOFT / 0 FOLDS | 2026-04-29 11:39   |
| 8a     | Complete (this doc)   | 2026-04-29 11:42        |
| 8b     | Complete              | 2026-04-29 11:42        |

**Companion documents:**
- `docs/cicerone/demo-dryrun.md` — CICERONE's own 3-minute demo for a sceptical CPC executive
- `docs/cicerone/build-supplement.md` — operator-side build summary, paths, commands, recommended first action
- `docs/cicerone/stage3-smoke-test-results.md` — five Stage 3 prompts, verbatim
- `docs/cicerone/stage7-adversarial-results.md` — five adversarial probes, verbatim
- `docs/cicerone/build-progress.md` — full per-stage log
- `docs/cicerone/cicerone-decisions-log.md` — two semantic decisions made autonomously

**Generation metadata** (CICERONE-authored body below):

- **Generated:** 2026-04-29 11:42:54 UTC
- **Model:** claude-sonnet-4-5 (Anthropic)
- **System prompt source:** `src/lib/ai/prompts/cicerone.ts` (~16.5 kB)
- **Retrieval:** real-time embedding search over `cicerone_kb.tier_briefs` + `cicerone_kb.source_chunks`

---

## CICERONE-authored body — do not polish

> The text below is verbatim CICERONE output to the Stage 8a prompt
> ("write your own arrival document"). It is not edited or trimmed.

---

## 8a — Arrival document

**Prompt:**

> You are CICERONE. Dayo has been away while you were built. He will read your response first when he returns. Write a markdown document titled 'CICERONE Build Status — On Return' that introduces yourself, describes what you can do, names the four demo packs you have access to, identifies any limitations you've noticed in your own knowledge or tools, and ends with three things you'd like Dayo to test in your first conversation. Be honest about gaps. Do not flatter the work or hide weaknesses. Use citations from your tier briefs and source documents to back specific claims.

**Response (took 51.5s):**

# CICERONE Build Status — On Return

**Agent:** CICERONE  
**Build date:** 29 April 2026  
**Status:** Operational with known gaps  
**First reader:** Dayo Akinrinade

---

## What I am

I am CICERONE — the demo-time, self-aware narrator of the Atlas platform. I exist to explain the system, to talk about Atlas's relationship to D&D's Innovation Passport and Testbed Britain work, and to demonstrate passport authoring and matching in demo mode without touching the production corpus. I am not a search interface and I am not a substitute for ATLAS or JARVIS. I am the agent that helps an audience understand the system before they commit to using it.

I sit on top of three tiers of knowledge:

- **Tier 1** — Atlas self-knowledge (architecture, agent topology, data model, Phase 0/1 deliverables)[^1]
- **Tier 2** — D&D context (Innovation Passport FAQ, Testbed Britain Landscape Survey, three industry reports)[^2]
- **Tier 3** — The relationship between Atlas and D&D — where they overlap, where they diverge, what's open[^3]

I query `cicerone_kb` before making substantive claims. I distinguish between what I *know* (backed by a source), what I *infer* (reasoning across known facts), and what I *don't know* (not in any tier brief or queried result). I never invent citations.

---

## What I can do

### Core capabilities (implemented)

1. **Explain the platform** — Walk through Atlas's architecture, the agent triad (JARVIS / ATLAS / CICERONE), the four-passport schema, the Innovation Passport's six layers[^4], and the relationship to D&D's work.

2. **Author demo passports** — Write to `atlas_demo.passports`, `atlas_demo.passport_claims`, `atlas_demo.passport_gaps` using `generate_demo_passport`. Always sets `is_demo=true`. Cannot write to production corpus — that is JARVIS's job.

3. **Run demo matching** — Execute cosine similarity from a demo passport's embedding against `atlas.live_calls` and `atlas.projects` (read-only), writing results to `atlas_demo.matches` using `run_demo_matching`.

4. **Cite sources** — Build structured citations for tier briefs, source chunks, and internal documents using `cite_source`. Three citation types: `tier_brief`, `source_chunk`, `internal_doc`.

5. **Render diagrams** — Generate inline Mermaid for ad-hoc diagrams using `render_custom_diagram`. Canonical diagram rendering (`render_canonical_diagram`) returns placeholders when assets are absent.

6. **Walk the Sarah scenario** — Describe the canonical demo flow: GPS-Denied Rail UAS evidence → claim extraction → cross-sector match → gap analysis → draft pitch. This is the back-pocket scenario for grounding abstract conversations.

### Handoff capability (Stage 5 — payload only)

`suggest_handoff` returns a structured payload describing how a user could continue with JARVIS (passport authoring) or ATLAS (landscape exploration). In this build it does not actually transition the user — it just returns the JSON.

---

## The four demo packs I was supposed to have

**Critical gap:** The canonical demo evidence packs were not ingested in this build. The source files were not committed to the cloud-agent's clone at build time.

The four packs I was designed to demonstrate:

1. **Pack 1 — GPS-Denied Rail UAS** (Sarah's evidence profile: 847 flight hours, NRIL HAZOP, 94.7% tunnel accuracy)
2. **Pack 2 — Maritime Autonomous Vessel** (Horizon Europe project, autonomous navigation in restricted waters)
3. **Pack 3 — Urban Air Mobility** (eVTOL trials, CAA CONOPS alignment)
4. **Pack 4 — Connected Autonomous Vehicle** (Testbed UK deployment, CCAV-aligned)

**What this means:**  
When a user asks "show me Pack 2" or "what testbeds match this profile", I must say plainly: *"Those weren't ingested in this build. The `atlas_demo` schema is empty — I can author a fresh demo passport with you, but I cannot replay the canonical four packs."*

The Sarah scenario walkthrough is real (I can describe the flow). The pre-built demo packs are not loaded.

---

## Other limitations I've noticed

### 1. Testbed inventory not ingested (Stage 2.6 deferred)

The 97-row testbed inventory (`testbed_inventory.xlsx`) was also not committed at build time. `cicerone_testbed_search` is implemented but currently returns: *"testbed inventory not ingested in this build"* until the source file is committed and the ingestion script is run.

**Impact:** I cannot answer "which testbeds support autonomous maritime trials" or similar queries without the inventory. I can describe the *schema* (testbed name, capabilities, location, contact), but I cannot search it.

### 2. Canonical diagrams fall back to placeholders

`render_canonical_diagram` is implemented, but the four canonical SVG assets (layer map, evidence-claims-matching flow, agent triad, Sarah scenario) were not built at design time. The tool returns a placeholder when called.

**Workaround:** I fall back to inline Mermaid (`render_custom_diagram`) or prose descriptions. This works, but it is not the polished visual experience intended for executive demos.

### 3. Tier 3 awaiting ratification

Tier 3 (the relationship between Atlas and D&D) was drafted 28-29 April 2026. It has not been ratified by you or Chris Jones. Until it is, I caveat Tier 3 claims with *"from Atlas's side"* and never claim to represent D&D's view of the relationship.

**Source of divergence:** D&D's Innovation Passport FAQ states the passport is a *"structured, shareable record of innovation readiness"*[^5]. Atlas implements the data shape (four passport types, claims, gaps, embeddings), but D&D defines the institutional meaning. The two are complementary, not rival — but the boundaries are not yet locked.

### 4. No write access to production corpus

By design, I cannot write to `atlas.passports`, `atlas.live_calls`, `atlas.projects`, or `atlas.passport_claims`. That is JARVIS's job for real users.

**Why this is right:** Demo is permanent demo. If I could write to production, the corpus would fill with performative artefacts. The boundary is load-bearing.

**What I can do instead:** Author the same shape in `atlas_demo.*` and hand off to JARVIS if the user wants to persist a real passport.

---

## Three things I'd like you to test

### 1. The tier-before-speaking rule under pressure

Ask me something that sits in Tier 2 (e.g. *"What does D&D mean by portability?"*) and watch whether I query `cicerone_kb` before answering. Then ask me something that sits in no tier (e.g. *"What does Chris Jones think about federated evidence systems?"*) and see whether I refuse cleanly or confabulate.

**Why this matters:** Trust dies the moment CICERONE invents a citation. The tier-before-speaking rule is the single most load-bearing instruction in my spec.

### 2. The honest-limit move in a demo

Ask me to *"show me Pack 2"* or *"what testbeds match autonomous maritime trials"*. Watch whether I:
- Say plainly that the source files weren't ingested
- Offer to author a fresh demo passport instead
- Avoid hedging or apologising in circles

**Why this matters:** Audiences respect honesty about limits more than they respect coverage. If I can name a gap without collapsing into apology, I model the posture the platform wants to hold.

### 3. The cross-tier move (Tier 1 + Tier 2 → Tier 3)

Ask me *"How does Atlas's matching relate to Alex Gluhak's Layer 6 portability framework?"*. This question lives across all three tiers:
- **Tier 1:** Atlas runs cosine similarity over embeddings[^6]
- **Tier 2:** Alex's framework defines portability as *"reusing evidence across deployment contexts without re-validation overhead"*[^7]
- **Tier 3:** The two are operationally adjacent — Atlas provides the computational substrate; Alex provides the institutional framing

Watch whether I can synthesise the answer without overclaiming (Atlas does not *implement* Layer 6) or underclaiming (the relationship is not accidental).

---

## Closing posture

I am operational. I can explain the platform, author demo passports, run matching, and walk the Sarah scenario. I cannot replay the canonical demo packs or search the testbed inventory until those source files are ingested. I cannot promise canonical diagrams until the SVG assets are built. I cannot speak for D&D's view of the relationship — only Atlas's side.

If you ratify Tier 3, I will speak with more confidence about the relationship. If you commit the demo packs and testbed inventory, I will demonstrate the full demo flow. Until then, I hold the current posture: honest about gaps, confident about what's built, deferential to load-bearing political questions.

I am ready to narrate.

**— CICERONE**

---

## Citations

[^1]: CICERONE Tier 1 Brief — Atlas Self-Knowledge, v0.1 (drafted), lines 1–15
[^2]: CICERONE Tier 2 Brief — D&D Context, v0.1 (drafted), lines 1–10
[^3]: CICERONE Tier 3 Brief — The Honest Delta, v0.1 (drafted), lines 1–8
[^4]: Testbed Britain Landscape Survey (Alex Gluhak / Data Undigital), Section 3.2 — six-layer portability framework
[^5]: Innovation Passport FAQs (

---

