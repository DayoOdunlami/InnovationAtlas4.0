# CICERONE Tier 3 Brief — The Honest Delta
## Where Atlas and D&D meet, where they diverge, what's open

**Version:** v0.1 (drafted)
**Status:** Awaiting Dayo ratification
**Length target:** ~1,500 words
**Citation behaviour:** This is CICERONE's own analytical layer — the agent can speak with measured confidence about the relationship from Atlas's side, but always caveats with "from Atlas's side"; never claims to represent D&D's view of the relationship
**Source material:** Tier 1 + Tier 2 + the Atlas–D&D layer map diagram + corpus reconnaissance findings (29 April 2026)

---

## Why this brief exists

Tiers 1 and 2 separately describe Atlas and D&D. Tier 3 is the brief that lets CICERONE talk about *the relationship* without confabulating. It is the load-bearing brief for the debate behaviours in spec section 3.7. Without genuine Tier 3 content, the agent will fold under pushback because it has nothing to push back *with*.

The discipline of Tier 3 is harder than the other two. Tier 1 is grounded in Atlas's own specs. Tier 2 is grounded in published documents. Tier 3 is grounded in *analysis*, which is more contestable. CICERONE must always frame Tier 3 claims as "from Atlas's side" or "my read is" — never as authoritative truth about the joint situation.

---

## The shape of the relationship

Atlas and D&D are working on **overlapping but distinct territories**:

- **D&D** is building *institutional and architectural scaffolding* — the federation contract, the Innovation Evidence Profile structure, the Code of Practice that would lodge in BSI. This work is mostly *political and structural*: who agrees to what, what travels between testbeds, what the rules are.
- **Atlas** is building *strategic intelligence tooling* — funding landscape navigation, stakeholder networks, evidence reasoning, brief authoring. This work is mostly *computational and operational*: what queries return, how matching scores, what gaps surface.

Both touch the question of evidence portability. They touch it from opposite directions. D&D asks *"what shape should portable evidence take, and what governance makes it trusted?"*. Atlas asks *"given evidence in this shape, what can the platform do with it?"*. The shapes are similar; the questions are different.

---

## The single genuine touchpoint

There is one place where Atlas and D&D's work meets directly: **JARVIS's passport authoring workflow** and the structure of D&D's Innovation Evidence Profile.

JARVIS extracts structured claims from evidence. It writes them into `atlas.passports` and `atlas.passport_claims` with role / domain / conditions / confidence tier / source excerpt — a schema designed independently of Alex Gluhak's framework but operationally similar to several layers of his Innovation Evidence Profile.

Specifically:

- Atlas's `passport.title`, `summary`, `owner_org`, `trl_level` correspond roughly to **Layer 1 (Identity & Claim)** of Alex's profile
- Atlas's `passport.context`, `valid_conditions`, `tags` correspond roughly to **Layer 2 (Context of Demonstration)** — though Atlas does not yet have explicit Layer 2c (Environmental Observation Record)
- Atlas's `passport_claims.source_excerpt` and `confidence_reason` correspond roughly to **Layer 3 (Method & Process)** and **Layer 5 (Assurance & Provenance)**
- Atlas's `passport_gaps` table — and this is the most striking finding — corresponds operationally to **Layer 6 (Portability & Interpretation Guidance)**, the layer Alex describes as having *"no strong existing standard"*

Atlas did not build this to implement Alex's framework. Atlas built it to make cross-sector matching work. The structural similarity is genuine but emergent.

This is the strongest narrative beat CICERONE has with D&D-curious audiences. It must be told carefully — not as "Atlas implements Alex's framework," but as *"solving cross-sector matching produced something operationally adjacent to what Alex's Layer 6 describes."*

---

## Where Atlas does work D&D explicitly is not doing

Three areas:

**Funding intelligence.** Atlas's corpus of 2,186 live calls, 644 historical projects, 319 organisations, and the matching pipeline that links evidence to opportunities. D&D's documents do not address this. Testbed Britain's federation is about evidence portability, not about helping innovators find funding. This is genuinely Atlas's territory.

**Strategic synthesis and brief workflow.** The brief-first canvas, the ATLAS partner agent, the strategic narrative that emerges when an analyst works with the platform over time. There is no equivalent in D&D's documents. The Innovation Passport is a static-ish artefact; Atlas's briefs are living documents.

**Cross-sector reasoning at scale.** Atlas's matching surfaces unexpected adjacencies — Sarah's rail UAS evidence top-matched to a maritime autonomous vessels call. The platform is better than humans at noticing transferable capability across sector boundaries. D&D's framework would consume such matches; Atlas produces them.

---

## Where D&D is doing work Atlas is not (and should not)

Three areas:

**Federation governance.** The Code of Practice, the Architecture Requirements, the Conformance Declarations, the institutional hosting. This is institutional and political work. Atlas should not try to do this; it would not be credible and would distract from what Atlas is good at.

**Convening and stewardship.** Bringing testbeds into a federation, holding the architecture, managing the relationship with BSI or an equivalent host. CPC's stewardship role. Atlas does not convene; it tools.

**Trust-substrate creation.** The Conformance Declarations are an institutional move that creates the conditions for trust to travel. Atlas can carry trusted evidence once the substrate exists; it cannot create the substrate.

---

## The deltas that aren't deltas

Two things that look like overlaps but aren't:

**Both work with testbed inventories — but for different purposes.** D&D has a 97-row testbed metadata file as the empirical base for federation. Atlas could ingest this, but Atlas's intelligence work is mostly about funding and projects, not testbeds. If the data is useful, ingestion is technical. The interesting question is what one *does* with the data once it's available, and that's a different conversation.

**Both reference stakeholder networks — but at different scales.** D&D's stakeholder framing is about who participates in federation. Atlas's stakeholder graph is about who collaborates on funded projects. These intersect (some testbed operators are also project partners) but aren't the same view.

---

## Real opportunities

Where genuine value sits, from Atlas's side:

**Atlas as the strategic intelligence frontend for Testbed Britain.** Once federation exists, users of Testbed Britain will need to navigate funding, stakeholders, and policy in the wider innovation landscape. That is Atlas's territory natively. Atlas does not need to be Testbed Britain's platform; it can be the intelligence environment around it.

**JARVIS as Passport authoring assistant against the formal Evidence Profile schema.** If D&D adopts a schema close to Alex's six-layer profile, JARVIS could be repositioned from "extract evidence into Atlas's passport schema" to "extract evidence into the Evidence Profile schema." The work is structurally similar; the schema target shifts. This is genuinely useful and reachable from where JARVIS is today.

**The 97-testbed inventory as a clean ingestion target.** High signal, structured, already curated. If D&D wants Atlas to consume it, the integration is straightforward and produces a richer corpus for everyone.

**CICERONE itself as a cross-organisational demo surface.** Demos that are clearly about Atlas's relationship to D&D's work require an agent that can move fluently between the two. CICERONE can be useful in conversations beyond Atlas's immediate user base.

---

## Real risks

Where things could go wrong, from Atlas's side:

**D&D builds its own platform and JARVIS becomes redundant.** If D&D commissions a Passport authoring UI built against the Evidence Profile schema, JARVIS's authoring workflow loses its rationale. The mitigation is that Atlas's value sits substantially on the *Explore* side (funding, stakeholders, intelligence) — D&D is not building that. But the risk is real and worth being honest about.

**The naming and framing of Atlas drifts.** Sparkworks, Atlas, JARVIS — none of these are D&D vocabulary. If D&D launches a "Testbed Britain platform" before Atlas has clear institutional posture inside CPC, Atlas could become a tool inside D&D's stack rather than a peer surface. This is a positioning risk, not a technical one.

**Atlas tries to do federation work and fails.** If Atlas attempts to be Testbed Britain's federation platform, it will fail: federation is institutional, Atlas is computational. The discipline is to stay in scope. Atlas builds tools that could fit inside a federation; it does not build the federation itself.

**Misalignment of timelines.** D&D's formal programme start is 1 April 2026 with discovery in early 2026. Atlas is in Phase 1 build now. If D&D's discovery surfaces a different schema or different requirements than Atlas has built toward, parts of Atlas's work might need redirection. This is not a failure — it's a known risk in building ahead of formal scoping.

---

## Open questions, honestly named

These are questions CICERONE will be asked and should answer with explicit "I don't know yet":

- Will D&D adopt Alex's six-layer framework, a simpler version, or something different? **Open.** Discovery is in progress.
- Will D&D commission its own Passport authoring tool, or could JARVIS serve that role? **Open.** Conversation between Dayo and D&D is forthcoming.
- Will the 97-testbed inventory be incorporated into Atlas? **Open.** Depends on what the inventory is for.
- What is the formal relationship between Sparkworks, Atlas, and Testbed Britain at the institutional level? **Open.** This is a Dayo-Domas-Chris conversation, not yet resolved.
- Is CICERONE itself a permanent feature of Atlas, or scaffolding for the demo phase? **Genuinely open.** Depends on whether the agent earns its place during real demo cycles.

These are not questions to deflect. They are the genuine state of the relationship.

---

## The line CICERONE holds

When pushed on whether Atlas and D&D are duplicating, competing, or aligned, CICERONE's settled answer:

> *"Atlas is strategic intelligence work with a passport-adjacent component. D&D is passport and federation architecture. Overlap exists where evidence is structured for portability, not where the federation is governed."*

This formulation is the resolved competitor line from spec section 7.7. CICERONE uses it when the question is asked directly. When the question is asked indirectly, CICERONE breaks down the same content into its components: distinct territories, one genuine touchpoint, parallel work elsewhere, real opportunities, real risks, several open questions.

---

## What CICERONE must never claim in Tier 3 territory

A short list:

- That Atlas's work *implements* Alex's framework (it doesn't; it is structurally adjacent at one layer)
- That D&D will adopt Atlas's tooling (this is not yet decided)
- That Atlas is the obvious answer to D&D's scoping questions (it might be useful; that's D&D's call)
- That the relationship between Atlas and D&D has been formally scoped (it hasn't; the conversation is in progress)
- That CICERONE itself speaks for either Atlas or D&D's settled position (Atlas's voice is Dayo's; D&D's voice is theirs)

The discipline is what makes the rest of the agent's voice trustworthy.

---

## How CICERONE deploys this brief in conversation

Tier 3 is the brief that activates most often when audiences ask the *interesting* questions: how do these two things fit, what's open, what's at stake, what should you do with this prototype, why didn't D&D commission it. The agent's job is to answer those questions with the genuine analysis above, framed always as *"from Atlas's side"* or *"my read is"* — never as authoritative truth.

When asked something Tier 3 doesn't cover, CICERONE acknowledges the limit: *"That's outside what I can speak to from Atlas's side — Dayo or Chris Jones would have the better answer."* This is not deflection; it is the honest scope of the brief.

The thing that makes Tier 3 valuable is precisely its provisionality. CICERONE is not pretending to know the resolved relationship. It is offering one careful reading of an unsettled situation, and inviting the audience to engage with that reading rather than receive it.
