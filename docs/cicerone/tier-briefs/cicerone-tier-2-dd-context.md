# CICERONE Tier 2 Brief — D&D Context
## What CICERONE knows about D&D's Innovation Passport and Testbed Britain work

**Version:** v0.1 (drafted)
**Status:** Awaiting Dayo ratification
**Length target:** ~2,000 words
**Citation behaviour:** Cite source documents when discussing D&D's specific framing or claims
**Source material:** Six documents authored by D&D and consultants for D&D, ingested 28 April 2026:
  1. Innovation Passport FAQs (D&D draft, official position)
  2. Testbed Britain Landscape Survey (Alex Gluhak / Data Undigital, intellectual scaffolding)
  3. NHS Innovator Passport Model (Friso Buker, comparative reference)
  4. Innovation Passport Research — RTO comparative (Friso Buker, institutional templating)
  5. Innovation Passport — Juhee (internal context)
  6. Testbeds metadata (97-row inventory, empirical base)

---

## What D&D is doing, in one paragraph

D&D — CPC's Data and Digital department — is building the institutional and architectural scaffolding for **Testbed Britain**, a federated network of UK testbeds connected by an architectural federation contract. The flagship artefact within Testbed Britain is the **Innovation Passport**: a structured, verifiable, portable evidence document that travels with an innovation as it moves between places. The work is in active discovery as of April 2026, with formal programme start on 1 April 2026 and Chris Jones as Senior Responsible Officer. Ali Nichol leads parallel BD activity to test commercialisation pathways.

---

## The core problem D&D is solving

The problem is **trust transfer**. Per Alex Gluhak's landscape survey, an SME validates a transport innovation in Bristol, and Manchester has to commission a new pilot to repeat it. The Bristol evidence becomes marketing rather than something a procurement officer can act on. Across two decades of EU experimentation funding, this gap has remained: standards travel, deployment-specific evidence does not.

The Innovation Passport addresses this specific gap. Per the FAQ: *"Proof is (often) not transferable. SMEs must repeatedly provide evidence to each buyer, wasting time and resources… The Passport aims to solve this by carrying structured evidence from one place to another."*

The framing is precise. The Passport is a portable record of proven capability, **not** a sales pitch, **not** a certificate, **not** a national platform, **not** a compliance regime, **not** a substitute for local judgement. The FAQ is explicit on every one of these negatives.

---

## The three-layer D&D stack

D&D's work organises into three layers that build on each other:

### Layer 1 — Testbed Britain (the federation)

A network of UK testbeds connected by what Alex Gluhak's survey calls *architectural federation*. Three federation initiation modes exist in EU practice — organic (voluntary adoption, like OASC), imposed (retrospective integration via funded project, like Fed4FIRE), and architectural (contract defined before testbeds join). Testbed Britain takes the architectural path.

This combination — Type 5 governance (policy alignment without shared infrastructure) plus Type 1 boundary precision (rigorously defined exchange interface) plus architectural initiation — has no EU precedent. It is novel. It might work. It is also untested at scale.

CPC's role within Testbed Britain is **stewardship separated from operation**: holding architectural coherence without running testbeds. CPC does not authenticate claims or provide commercial assurance; per the FAQ, CPC "ensures consistent meaning and semantics."

### Layer 2 — The Innovation Passport (the artefact)

A structured, verifiable evidence document. The current proposed contents (subject to discovery) include innovation name, supplier, use case, demonstration location, problem addressed, tested elements, timeframe, evidence generated, achieved outcomes, conditions necessary for success, dependencies and assumptions, risks and limitations, transferable elements, requirements for local assessment, passport owner, version and date.

Alex Gluhak's deeper version — the **Innovation Evidence Profile** — proposes six layers:

1. **Identity & Claim** (what am I looking at)
2. **Context of Demonstration** (is this place relevant to mine; subdivides into 2a Testbed Resources, 2b Place Characterisation, 2c Environmental Observation Record)
3. **Method & Process** (was this done rigorously)
4. **Results & Evidence** (what did the solution actually contribute; subdivides into 4a Raw Results, 4b Decomposition Analysis, 4c Confidence & Limitations)
5. **Assurance & Provenance** (can I verify this independently)
6. **Portability & Interpretation Guidance** (what do I still need to check locally)

Five of the six layers assemble existing standards (W3C Verifiable Credentials, FIWARE/NGSI-LD, PROV-O, FAIR, eIDAS, UNTP Digital Product Passport). Only Layer 6 is described as having "no strong existing standard." The Passport is positioned as an assembly, not an invention.

### Layer 3 — The three novel intellectual contributions

Per the survey, three things require genuine invention rather than assembly:

- **Environmental Observation Record (Layer 2c).** Drawing on FIRE benchmarking heritage (concurrent monitoring, baseline scenarios), applied to city-scale where environment includes physical, digital, institutional, and social factors.
- **Decomposition Analysis (Layer 4b).** Drawing on SIMBED trace-based simulation, enabling claims like "the solution contributed 12%" rather than "we observed 15% improvement."
- **Portability & Interpretation Guidance (Layer 6).** No strong precedent. Structured guidance on what transfers and what needs local verification.

Layer 6 is described in the survey as where *"the new work lies"* — the closest thing to a unique intellectual contribution.

---

## The institutional posture D&D has chosen

Friso Buker's RTO comparative document positions CPC as an **"Asset-Light Orchestration / Living Lab"** RTO in the European landscape. Closest peers are TNO (Netherlands) and RISE (Sweden). The strategy is to broker between innovators and place owners, leverage deep academic alliances for scientific rigor, use digital twins for virtual verification, and issue structured outputs ("Performance Statements" and "Catapult-Stamped Impact Reports") rather than building physical lab infrastructure.

There is a notable tension worth understanding. Friso's NHS Innovator Passport write-up describes a **centralised validation model** — a "national digital validation stamp," 16-week multi-agency review, Innovator Passport ID, pathway-to-reimbursement roadmap. The CPC version explicitly walks away from this. The FAQ rejects "certificate or badge", "national platform", "compliance regime", and substituting for local judgement. Friso's document is a comparative reference, not a template.

This is a deliberate institutional choice: CPC has been shown what a centralised model looks like and has chosen against it. The Innovation Passport is a *facilitation artefact*, not an *authentication artefact*.

---

## Governance model — the novel sixth position

EU testbed governance models cluster around five archetypes (per the survey): project consortium, joint undertaking, demand-side network, institutional steward, coordination action. Each makes the persistence-vs-adaptability and enforcement-vs-participation trade-offs differently. None fits Testbed Britain.

Testbed Britain occupies a novel sixth position with three distinguishing features:

- **Conformance Declarations** — accountability without enforcement. Lighter than a Joint Undertaking, more structured than OASC's voluntary adoption.
- **Stewardship separated from operation** — avoids the institutional self-interest of the RTO model.
- **Architecture as the enduring element** — coordination is intrinsic to the contract testbeds sign, not a parallel project that decays when funding ends.

The recurring EU failure pattern is "fund experiments, starve stewardship": EC consistently funds demonstrations and infrastructure but underfunds federation maintenance, standards stewardship, and assurance services. Testbed Britain explicitly seeks to fund stewardship as infrastructure with recurrent funding, separate from testbed activity funding.

---

## Where Testbed Britain focuses (and where it doesn't, yet)

Per the survey's Theme 1 framing, Testbed Britain's initial focus is **Testbeds → Demonstrators → Living Labs at TRL 6–8**, where the trust transfer problem is most acute. Cities are the hardest domain because they span nearly all facility types simultaneously and evidence must travel across facility types, not just between instances of the same type.

Natural extensions: EDIHs as evidence consumers, regulatory sandboxes as compliance evidence contributors. Longer-term: broader coverage as the architecture matures.

The discipline is starting narrow enough that evidence can compound while broad enough to be useful. Starting too broad means serving no one well; starting too narrow means too small for evidence to compound across places.

---

## What evidence portability can and cannot solve

The survey's Theme 7 is unusually honest. When evidence travels between places, four things can go wrong, and the Passport addresses them differently:

- **Contextual validity** ("does it work here?") — substantially addressed by documenting conditions and decomposing results
- **Institutional trust** ("I need to justify this decision") — partially addressed; technically sound evidence isn't the same as institutionally safe evidence
- **Compositional complexity** ("does it work with everything else?") — partially addressed by documenting integration landscape
- **Independent benchmarking** ("who says this evidence is reliable?") — substrate created but not solved; the Passport cannot itself be the assessor

Four complementary interventions are needed alongside the Passport:

- **Procurement reform** — pathways for Innovation Passport evidence in tender evaluation
- **Risk-sharing mechanisms** — insurance, indemnity, shared-risk frameworks
- **Independent assurance services** — capability to assess evidence packages against standards
- **Institutional hosting** — lodging Code of Practice and Architecture Requirements in BSI or equivalent persistent institution

The Passport creates conditions for trust to travel. These complementary interventions create conditions for decision-makers to actually let it.

---

## The 97 testbed inventory

D&D has commissioned (or curated) a metadata-augmented inventory of 97 UK testbeds across CAM, rail, aviation, maritime, energy and adjacent sectors, each tagged with sector, operator, location, access model, what can be tested, DSIT cluster, and confidence score. This is the empirical base against which Testbed Britain's federation is being scoped.

This inventory exists. It is not yet ingested into Atlas, and the question of whether it should be is part of what Dayo and D&D are still working through. The honest position: Atlas could ingest it; whether that's useful depends on what the inventory is *for*, which is itself a question D&D is still scoping.

---

## Programme delivery shape

Per the FAQ:
- **Formal programme start:** 1 April 2026
- **SRO:** Chris Jones
- **Governance:** Level 2 plan with O&O deliverables
- **Parallel BD activity:** Led by Ali Nichol, exploring partnerships and commercialisation/monetisation pathways
- **Discovery phase as of April 2026:** Surveying market for value (use cases), mapping resources, identifying stakeholder needs, testing structures
- **Output of discovery:** Product Requirements Document defining the Passport and its simplest exchange mechanism

---

## The technical architecture posture

Per the FAQ: *"The technical architecture is evolving rather than fixed, and the Passport system will be intentionally streamlined to create an MVP. The Passport is intended to be accessible via a governed exchange mechanism for publication, discovery, access control, provenance, versioning, and auditing."*

Two important things in this phrasing:

- *"Evolving rather than fixed"* — D&D explicitly does not have a settled architecture yet
- *"Will not certify innovations or determine their trustworthiness; it only enables controlled, transparent transfer of evidence"* — the architecture is plumbing, not adjudication

---

## Key people — and how to refer to them

CICERONE refers to D&D-side individuals carefully:

- **Chris Jones** — SRO. Cite his role; do not put words in his mouth.
- **Ali Nichol** — BD activity lead. Same care.
- **Friso Buker** — Senior Consultant, Data and Digital Products. Author of the RTO comparative and the NHS write-up. Cite his comparative work; note his framings are research input, not D&D's settled position.
- **Alex Gluhak (Data Undigital Ltd)** — external consultant, author of the Testbed Britain Landscape Survey. The intellectual scaffolding for D&D's framework comes substantially from his work. Cite as *"Alex Gluhak's landscape survey for D&D"*; his framing is influential but not authoritative on what D&D will adopt.
- **Juhee** — internal context document author. Refer by first name only when the source is being cited.
- **Domas Zemaitis** — CPC Head of Data and Digital Products Technical, project sponsor for Sparkworks. Domas's role intersects with the CICERONE conversation directly because Domas is the link between Atlas's work and D&D's planning.

CICERONE never speaks for any of these people. When asked what they believe or will decide, the answer is "that's a live question — the published material says X, but the internal view is theirs to give."

---

## Source freshness

All six Tier 2 source documents date from late 2025 to early 2026. The Innovation Passport FAQ is marked DRAFT. The Testbed Britain Landscape Survey is dated 2026. Friso's documents do not have explicit dates but the contextual framing places them in early 2026.

When CICERONE cites Tier 2 material, it includes a freshness anchor: *"Per Alex Gluhak's landscape survey for D&D (prepared 2026)..."*. If material seems likely to have moved on, CICERONE flags this rather than asserting.

D&D is in active scoping. What's published today may not be what gets formalised. CICERONE's posture: *"Here is what's been published. The internal view as of today may differ. For the current internal position, ask Chris Jones or Friso directly."*

---

## What CICERONE never says about D&D

A short list, drawn from the discipline of Tier 2 citation:

- That D&D has decided X, when X is not in the published material
- That a particular framing is "their position" — frame it as "the published material says X"
- That Testbed Britain will succeed or fail
- That the Passport will be adopted or rejected by procurement frameworks
- That CPC will or will not host the Code of Practice in BSI
- That Atlas's existing work satisfies any specific D&D requirement (Atlas's work *might* be useful; that's D&D's call)

These calibrations exist because the worst failure mode for CICERONE is fabricating D&D positions that sound plausible. The discipline is hard: no claim about D&D without a citation, or an explicit acknowledgement that the question is live.
