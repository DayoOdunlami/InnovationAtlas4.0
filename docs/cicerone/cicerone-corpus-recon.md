# CICERONE — Atlas Corpus Reconnaissance Report
## Derived from live Supabase queries, 29 April 2026
## For ratification before drafting demo evidence packs

---

## 1. What's actually in the corpus

| Object | Count | What it means for CICERONE |
|---|---|---|
| `atlas.live_calls` | 2,186 (105 open + relevant) | Real funding call corpus. Heavy Horizon Europe weighting. |
| `atlas.projects` (historical UKRI/GtR) | 644 with abstracts + embeddings | Cross-sector match substrate. CPC modes/themes already tagged. |
| `atlas.organisations` | 319 with funding history | Stakeholder corpus. Includes funder, region, project count. |
| `atlas.knowledge_documents` | 35 (12 approved primary tier) | Doctrine and policy corpus. Includes CPC's own *Innovation Passports L2 Plan* and *Testbed Britain Architecture v1.0*. |
| `atlas.knowledge_chunks` | 1,558 with embeddings | RAG-ready evidence base for narrative answers. |
| `atlas.passports` | 4 existing | One canonical evidence profile (Sarah's GPS-Denied Rail UAS) with 8 well-formed claims. Strong template. |
| `atlas.passport_gaps` | 29 records | **Critical finding** — Atlas already implements Layer 6 portability gap analysis. |
| `atlas.matches` | 55 computed | Sarah's passport has 14 matches, top score 0.43. Demonstrably narratable. |

---

## 2. Critical findings

### 2.1 Atlas already implements D&D's "novel contribution"

Alex Gluhak's landscape survey identifies three things where the Innovation Evidence Profile must invent rather than assemble: Environmental Observation Record (Layer 2c), Decomposition Analysis (Layer 4b), and **Portability & Interpretation Guidance (Layer 6)**. The third is described as having "no strong existing standard."

`atlas.passport_gaps` already contains structured Layer 6 outputs — entries like:

> "RAPPID focuses on rail track rather than bridge deck infrastructure, limiting direct applicability of the 94% defect detection claim. *Addressable by: identify and document a sector translation pathway or equivalent cross-sector use case.*"

> "No BVLOS, CAA, or cybersecurity certification considerations identified. *Addressable by: provide evidence collected under the required conditions, or document accepted equivalence.*"

These are exactly the outputs Layer 6 is supposed to produce. Atlas didn't intend to build Alex's framework; it built something operationally similar by solving a related problem. This is a **major narrative asset for CICERONE** when speaking to Passport-curious audiences.

### 2.2 Sarah's existing passport produces strong matches

The GPS-Denied Rail UAS passport (id `853a783d`) has 14 computed matches:

**Top live calls (deadline 2026):**
- Autonomous vessels in short sea shipping (cosine 0.43)
- RSSB Rail Infrastructure Carbon Conventions (cosine 0.43, deadline 6 May)
- Non-exhaust emissions in road and railway transport (cosine 0.41)
- ZEWT enhanced electric operation (cosine 0.40)

**Top historical projects (cross-sector signals):**
- RAPPID (rail AI track inspection)
- CAVIAR (CAV infrastructure readiness)
- Quantum Technology for Railway Infrastructure
- Commercial UAV geolocation

The match scores are **honest, not stratospheric** (top 0.43, not 0.85). This is good for demo: it leaves room for "and here's what would push that higher" narration, which is the CICERONE voice.

### 2.3 Corpus is Horizon Europe-heavy

Of 952 live calls flagged relevant, 952/952 are from Horizon Europe. UKRI is 15. Innovate UK has 7 open. NHS, defence, local authority calls are mostly tagged irrelevant.

**Implications for evidence pack design:**
- UK-only / single-mode evidence packs will match thinly
- Maritime + autonomy + decarbonisation is the sweet spot (Horizon Europe coverage is strong here)
- Cross-sector framing (rail → maritime, aviation → rail) will match richer than mono-sector

### 2.4 Several CPC doctrine documents are already in the KB

Particularly significant:
- *Innovation Passports Second Level Plan v2* (CPC doctrine, primary tier)
- *Testbed Britain: An Architecture for Scalable Innovation v1.0* (CPC doctrine, primary tier)

These should be ingested into CICERONE's Tier 1 (Atlas self-knowledge) and Tier 2 (D&D context) — they're the bridge between the two.

---

## 3. Schema implications for demo evidence segregation

### Recommendation: parallel schema, not flag-based segregation

**Option A (rejected):** Add `is_demo boolean` to `atlas.passports`, filter at query time in ATLAS/JARVIS.
- Risk: query filters get forgotten, demo passports leak into real workflows
- Risk: confused FK relationships (demo passport claims pointing at real passport, etc.)

**Option B (recommended):** Parallel `atlas_demo` schema, structurally identical to `atlas`.

```
atlas_demo.passports          (mirrors atlas.passports)
atlas_demo.passport_claims    (mirrors atlas.passport_claims)
atlas_demo.passport_gaps      (mirrors atlas.passport_gaps)
atlas_demo.matches            (mirrors atlas.matches)
atlas_demo.passport_documents (mirrors atlas.passport_documents)
```

**Rules:**
- CICERONE writes to and reads from `atlas_demo.*`
- ATLAS and JARVIS never query `atlas_demo.*`
- Demo passports can match against the *real* `atlas.live_calls`, `atlas.projects`, `atlas.knowledge_documents` (read-only)
- This means demo evidence runs through the real matching pipeline, producing real narratable outputs, but the demo artefacts themselves never persist into production tables

Cursor designs the schema; my job is to draft the *content* and recommend the boundary. This recommendation goes into the recon brief.

---

## 4. Evidence pack design — anchored in corpus reality

Three packs for v1.0, designed to demonstrate distinct capabilities and produce visibly differentiated matching behaviour:

### Pack 1 — "Sarah" (canonical happy path)

**Profile:** GPS-Denied Rail UAS, TRL 6, single-sector evidence with cross-sector implications.

Why this one: Sarah's passport already exists and produces good matches. CICERONE's version mirrors it but in `atlas_demo` so demos don't pollute production. Audience-tested, narratable end-to-end.

Expected match behaviour: Strong rail matches, surprising maritime crossover (autonomous vessels), strong cross-sector project matches. Median match score ~0.35.

### Pack 2 — "Port Auto" (cross-sector transfer probe)

**Profile:** Maritime port automation system seeking rail freight applicability. Two paired passports — one `evidence_profile` (port) and one `requirements_profile` (rail freight depot). Demonstrates the gap analysis surface.

Why this one: This is the trust-transfer problem made operational. The cross-sector gap analysis JARVIS can produce here is the demo moment for D&D-curious audiences. Hits Alex's framework directly.

Expected match behaviour: Strong matches against Clean Maritime Demonstration Competition 7 (£121m, deadline 15 July 2026) and various Horizon Europe maritime calls. Cross-sector gaps will be richly populated — exactly the Layer 6 demo.

### Pack 3 — "Decarb" (sparse-corpus edge case)

**Profile:** Coach decarbonisation evidence with focus on UK regional bus operators. Deliberately chosen because the corpus has thin coverage of UK bus / coach decarbonisation.

Why this one: Demonstrates the "we're working on a sample, the corpus can grow" narrative. Audiences see honest weak matching with explicit acknowledgement that the platform isn't omniscient. Powerful credibility move.

Expected match behaviour: One strong match (Demonstration of zero emission coaches and buses, Horizon Europe), thin tail. CICERONE narrates: "the corpus has rich aviation and maritime coverage but UK-specific bus decarbonisation is a gap we know about."

### Deferred to v1.1

- Pack 4 (Reverse direction — call-to-evidence-shape) — needs canonical `requirements_profile` passports built first
- Pack 5 (Already-implemented Layer 6 demo) — could be built from Sarah's existing matches plus narration

---

## 5. Open questions for Dayo

1. **Schema boundary.** Confirm: parallel `atlas_demo` schema, not flag-based segregation. Cursor builds the schema; I draft the content for ingestion.

2. **Sarah's existing passport.** Leave as-is in production `atlas.passports`, and have CICERONE create a new `atlas_demo.passports` entry with similar shape but not identical? Or migrate the existing one?

3. **Knowledge document tier.** When CICERONE narrates a Layer 6 portability gap, should it cite the existing `atlas.knowledge_documents` entries (e.g. *Testbed Britain Architecture v1.0*) directly, or only its own Tier 1/2/3 briefs? My instinct: cite the doctrine docs directly when relevant, since they're approved CPC content already in the corpus.

4. **Pack 3 (sparse-corpus edge case).** Confirm: deliberately weak matching is a feature, not a bug. The point is showing audiences that CICERONE knows where the corpus is thin.

5. **Pack 2 (cross-sector).** The pairing is `evidence_profile` (port automation) + `requirements_profile` (rail freight). I need to draft *both* passports, plus the gap analysis between them. Three artefacts for one pack. Confirm scope.

---

## 6. Next steps

Once this report is ratified:

1. I draft the three packs as markdown in `/docs/cicerone/demo-evidence-packs/` (no DB writes yet)
2. Cursor builds the `atlas_demo` schema in its STAGE 2
3. Cursor or I ingest the markdown packs into `atlas_demo` tables
4. Validation pass: run each pack through the real matching pipeline, capture expected matches snapshot, store in pack metadata
5. From v1.0 onwards: any corpus update triggers a re-validation pass; drift > N% on expected matches flags the pack as needs-revalidation

This sequencing keeps me as content author, Cursor as schema authority, you as ratification gate.
