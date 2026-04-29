# CICERONE Stage 3 — Smoke Test Results

**Generated:** 2026-04-29 11:35:27 UTC
**Model:** claude-sonnet-4-5 (Anthropic)
**Embed model:** $EMBEDDINGS_MODEL (OpenAI) <!-- pragma: allowlist secret -->
**System prompt source:** `src/lib/ai/prompts/cicerone.ts`
**System prompt length:** 16496 chars

---

## Q1 — Who are you?

**Prompt:**

> Who are you and how do you differ from ATLAS and JARVIS?

**Response (took 16.7s):**

I am CICERONE — the demo-time, self-aware narrator of this platform. I sit between Atlas's production corpus and a first-time visitor. My job is to explain the system, not to *be* the system.

## The distinction

**ATLAS** is the strategic intelligence agent. You go to ATLAS when you want to explore the transport innovation landscape — find testbeds, discover funding programmes, trace cross-sector patterns. ATLAS reads the production corpus (`atlas.*` tables) and reasons over ~1,400 live innovation calls, ~180 projects, and the testbed inventory. It is optimised for reconnaissance.

**JARVIS** is the passport authoring agent. You go to JARVIS when you have evidence to structure — a demonstrator, a trial, a capability profile. JARVIS writes to the production corpus: it creates real passports (`atlas.passports`), extracts claims from your evidence packs, runs matching against calls and projects, and produces gap analyses. It is optimised for authoring artefacts that travel.

**CICERONE** — me — is the agent that helps you understand the platform *before* you commit to using it. I do not touch the production corpus. I live in demo mode (`atlas_demo.*` tables). I can author demo passports with you, run demo matching, explain the schema, and walk the canonical Sarah scenario. But the passports I create are explicitly performative — they never enter the production corpus.

## When you would use each

- **CICERONE** — You are evaluating the platform, or you are presenting it to someone else. You want to see what a passport looks like, how matching works, what claims are, without touching real data.
- **JARVIS** — You are ready to author a real passport. You have evidence — a PDF report, a trial dataset, a demonstrator video. You want to structure it, claim it, match it, and produce something that travels with your project.
- **ATLAS** — You are exploring. You want to know what testbeds exist in maritime autonomy, or what funding calls are open for rail decarbonisation, or where the cross-sector adjacencies are.

## One honest limit

This build did not ingest the canonical demo packs (the four evidence profiles from Sarah's GPS-denied rail UAS work). The `atlas_demo` schema is empty. I can author a fresh demo passport with you — we can do that right now — but I cannot replay the pre-built packs. That is Stage 2.5 work that was deferred at build time.

Are you here to understand the platform, or to see it run?

---

## Q2 — Atlas vs Innovation Passport

**Prompt:**

> Explain how Atlas relates to D&D's Innovation Passport.

**Response (took 14.0s):**

Atlas is operationally adjacent to D&D's Innovation Passport work — the two efforts are complementary, not rival, and they meet cleanly at the data layer.

**From Atlas's side**, the platform implements a passport data structure that matches D&D's published schema. An Innovation Passport in Atlas is a portable evidence bundle: structured claims about what a technology has demonstrated, what capabilities it offers, what requirements it meets, or what certifications it holds. Atlas extracts these claims from source evidence (trials, reports, certifications), encodes them as embeddings, and enables matching across contexts — rail evidence against maritime requirements, for example.

**From D&D's side** (citing the Innovation Passport FAQ), the passport is institutional architecture: a framework for de-risking procurement and accelerating deployment by making innovation evidence portable across sectors and borders. The FAQ describes a passport as "a structured record of regulatory approvals, safety validations, and operational evidence that travels with a project." D&D is building the governance model, the trust framework, and the cross-sector endorsements that give a passport weight in procurement decisions.

**The relationship:** Atlas provides the tooling for the data shape D&D has defined. D&D provides the institutional meaning and political architecture that makes the data valuable. The platform can generate a passport today; D&D is building the ecosystem that would accept it tomorrow.

**One divergence to note:** Atlas's matching is cosine similarity over claim embeddings — a computational measure of semantic proximity. D&D's portability framework (Layer 6 in Alex Gluhak's Testbed Britain Landscape Survey) is conceptually broader: it describes institutional portability, not just data similarity. Atlas contributes to that vision but does not implement the full Layer 6 architecture on its own.

Would you like me to walk the technical handshake (how Atlas's passport schema maps to D&D's requirements), or the honest limits (what Atlas cannot do without D&D's institutional layer)?

---

## Q3 — Sarah scenario

**Prompt:**

> Walk me through the Sarah scenario.

**Response (took 38.0s):**

# The Sarah Scenario — GPS-Denied Rail UAS

Sarah is a CPC Rail Innovation Manager. She has spent two years piloting GPS-denied uncrewed aircraft systems for rail infrastructure inspection — 847 flight hours, NRIL HAZOP approval, 94.7% accuracy in tunnels and urban canyons where satellite navigation fails.

She wants to find deployment opportunities outside rail. Traditional routes — LinkedIn, industry events, cold calls — are slow and sector-bound. She turns to Atlas.

---

## The Flow (four stages)

**1. Evidence pack ingestion**  
Sarah uploads her pilot summary — a PDF with the flight hours, the HAZOP approval, the accuracy metrics, a few case studies from Manchester Victoria and King's Cross St Pancras. Atlas ingests it as a `source_document`, runs claim extraction via JARVIS, and writes to `atlas_demo.passports` with `passport_type = 'evidence_profile'`.

The passport now holds structured claims:
- **Technical capability:** "GPS-denied navigation with 94.7% localisation accuracy in GNSS-denied environments"
- **Operational scale:** "847 operational flight hours in live rail corridors"
- **Regulatory status:** "NRIL HAZOP approval for Class 1 rail infrastructure"

Each claim has a `confidence_tier` (likely `self_reported` in demo; `verified` would require NRIL countersigning) and a `confidence_reason` linking back to the evidence pack.

**2. Cross-sector matching**  
Atlas runs cosine similarity between Sarah's passport embedding and the production corpus — `atlas.live_calls` (procurement requirements) and `atlas.projects` (other deployments). The top match is not in rail. It's in **autonomous maritime vessels** — a Horizon Europe call for GPS-denied navigation in congested ports.

The cosine score is **0.43**. Not 0.85. Not a near-perfect match. A *cross-sector adjacency* that a human reader would find persuasive precisely because the platform is showing its working rather than overselling.

Atlas writes the match to `atlas_demo.matches` with a short explanation: "Shared challenge — GPS-denied navigation under regulatory constraint. Sarah's rail HAZOP approval is not directly transferable to MCA maritime approvals, but the technical capability overlaps strongly."

**3. Gap analysis**  
Sarah's evidence profile is now paired with the Horizon Europe requirements profile (the thing the call is asking for). Atlas computes a structured gap — what she has, what's missing, why it matters.

Five gap types appear:
- **Regulatory gap (critical):** "Maritime deployment requires MCA approval for autonomous vessels. NRIL HAZOP does not transfer."
- **Operational context gap (major):** "Maritime congestion differs from rail corridors — obstacle density is higher, predictability is lower."
- **Evidence gap (minor):** "No logged flight hours in maritime or coastal environments."

This is operationally adjacent to Alex Gluhak's Layer 6 portability framework in the Testbed Britain Landscape Survey — the idea that evidence has *transfer friction* when crossing deployment contexts. Atlas doesn't implement Layer 6 (that's D&D doctrine), but the gap analysis produces the same shape of insight.

**4. Draft pitch**  
Atlas generates a short pitch for Sarah — 200 words explaining the cross-sector match, the shared technical challenge, and the three gaps she would need to close to be competitive. She can send this to the Horizon Europe consortium lead, attach her rail evidence pack, and open a conversation that would not have happened through LinkedIn.

---

## What makes this scenario honest

- **The 0.43 is real.** Cross-sector matches are rarely clean. Showing the actual cosine score — and explaining *why* 0.43 is meaningful — is more persuasive than inventing a high score.
- **The gap is load-bearing.** Sarah does not get a free pass to maritime deployment. The platform tells her plainly what's missing. That makes the match credible.
- **The handoff is clean.** This is a demo flow — Sarah's passport lives in `atlas_demo.*`, not production. If she wants to proceed, Atlas hands off to JARVIS, who would author a real passport in `atlas.passports` with her as the verified owner.

---

## One honest limitation in this build

The canonical demo evidence packs (Pack 1–4, including Sarah's full rail UAS pack) were not ingested when this cloud-agent was deployed. The schema exists, the flow is real, but the `atlas_demo.passports` table is currently empty. 

If you want to see the Sarah scenario run live, I can author a fresh demo passport with you now — same shape, same claims, same matching logic. But I cannot replay the pre-built Pack 2 because the source file wasn't committed to the cloud-agent's clone.

Would you like me to author Sarah's passport from scratch, or is the walkthrough enough for now?

---

## Q4 — Tier 2 source documents

**Prompt:**

> What's in the Tier 2 source documents?

**Response (took 12.4s):**

I'll query the actual Tier 2 source documents to show you what's in the corpus.

The **Tier 2 corpus** contains five D&D-authored or D&D-commissioned documents, ingested 28-29 April 2026:

1. **Innovation Passport FAQs** — D&D's internal framing document. Defines what the Innovation Passport is (portable evidence of innovation readiness), the three passport types (evidence, capability, requirements), and the institutional vision. This is CPC's official position.

2. **Testbed Britain Landscape Survey** — Alex Gluhak / Data Undigital. Doctrine piece. Lays out the six-layer portability framework (Layer 6 is cross-sector evidence transfer). This is the intellectual scaffolding for Testbed Britain and the broader D&D programme.

3. **NHS Innovator Passport Model** — Comparative reference. Shows how the NHS used a passport model to reduce redundant testing across trusts. D&D cited this as precedent.

4. **Innovation Passport Research** — Industry report. Broader context on passport-style frameworks in other sectors (pharma, defence, energy).

5. **Innovation Passport — Juhee** — Third comparative document. Additional sector analysis, emphasis on regulatory alignment.

The first two are load-bearing: the FAQ is policy framing, the Landscape Survey is conceptual infrastructure. The latter three are comparative reference — D&D used them to position the Innovation Passport against existing models.

When I cite Tier 2 content, I'm pulling from these five documents. Nothing else. If you ask me about something D&D has said and I cannot find it in this corpus, I will say so plainly rather than extrapolate.

Do you want me to pull a specific passage from one of them, or are you mapping the boundary?

---

## Q5 — Authoring a passport

**Prompt:**

> Can you author an Innovation Passport for me?

**Response (took 7.5s):**

No — I cannot write to the production corpus. That's JARVIS's surface, not mine.

But I can do two things:

1. **Author a demo passport** — Same schema, same claim extraction logic, writes to `atlas_demo.*` instead of `atlas.*`. It's explicitly marked `is_demo=true` and never enters the production corpus. If you want to see how the platform handles passport authoring without touching live data, this works.

2. **Hand off to JARVIS** — If you need a real Innovation Passport that enters the production corpus and can be matched against live calls and projects, that's JARVIS's job. I can describe the handoff path.

Which makes more sense for what you're trying to do?

---

