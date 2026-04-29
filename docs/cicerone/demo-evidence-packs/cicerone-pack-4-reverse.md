# Demo Evidence Pack 4 — "Reverse Direction" (Call → Evidence Picture)
## CICERONE demo evidence | Pack ID: `demo_pack_reverse_call_to_evidence`

**Status:** Draft v0.1 | Awaiting recon ratification before ingestion
**Schema target:** `atlas_demo.passports` (`requirements_profile`)
**Last validated against corpus:** Pending

---

## Pack-level metadata

```yaml
pack_id: demo_pack_reverse_call_to_evidence
scenario_key: reverse_direction_reasoning
title: "Clean Maritime Demonstration Competition 7 — required evidence picture"
description: >
  Inverts the usual flow. Starts with a real open funding call (Innovate UK
  Clean Maritime Demonstration Competition 7, deadline 15 July 2026) and
  works backwards to articulate what the evidence picture would need to look
  like for an SME to be competitive. Demonstrates the platform reasoning
  *toward* evidence rather than from it.
linked_scenario: reverse_direction_reasoning
sector_origin: ["maritime"]
sector_target: ["maritime"]
trl_target: 7  # what the call expects evidence at
narrative_use:
  - "Demonstrating reverse-direction reasoning"
  - "Audiences who care about call-readiness rather than evidence-portability"
  - "Showing the platform's analytical voice, not just its matching"
audience_fit: ["passport_curious", "explore_curious", "general_cpc"]
anchor_call:
  source: atlas.live_calls
  expected_id: "to be looked up at ingestion time"
  title: "Clean Maritime Demonstration Competition 7 (all three strands)"
  funder: "Innovate UK"
  deadline: "2026-07-15"
  funding_amount: "£121m total across three strands"
expected_signature_outputs:
  - "Required evidence at TRL 6-7 readiness depending on strand"
  - "Decarbonisation pathway documentation (fuel choice, lifecycle emissions)"
  - "MCA regulatory engagement evidence"
  - "UK port deployment letters of intent"
  - "Vessel category and operational profile specificity"
median_match_score_target: "n/a — pack works the other direction"
```

---

## How this pack differs from Packs 1-3

Packs 1, 2, and 3 all start with evidence and ask "what does this match?"

Pack 4 starts with a call and asks "what evidence would match this?"

The artefact produced is a **`requirements_profile` passport** representing the call's evidence requirements. CICERONE narrates the reasoning that produced it, citing the call description and any relevant doctrine (UK Maritime Decarbonisation Strategy, etc).

Once the requirements profile exists, CICERONE can then run *forward* matching against `atlas.passports` and `atlas.projects` to surface candidate evidence holders. This double move — call → requirements → matched evidence — is the demonstration.

---

## Requirements profile passport

```yaml
passport:
  passport_type: requirements_profile
  title: "CMDC 7 — Required Evidence Picture (Demo)"
  owner_org: "Innovate UK / DfT (composite reading)"
  owner_name: "CICERONE-derived from call description"
  summary: >
    Required evidence picture for an SME to be competitive in Clean Maritime
    Demonstration Competition 7 across the three strands (feasibility,
    pre-deployment, deployment). Derived from the call description and
    cross-referenced with UK Maritime Decarbonisation Strategy and DfT
    maritime policy doctrine.
  context: >
    £121m competition with three strands at different readiness levels.
    Feasibility studies expect TRL 4-6 evidence; pre-deployment trials
    expect TRL 5-7; deployment trials expect TRL 7+ with a path to commercial.
  trl_target: 7
  sector_target: ["maritime"]
  approval_body: "MCA"
  valid_conditions: >
    Requirements derived from the call description. Final evaluation criteria
    will be determined by the assessment panel. This profile is a structured
    interpretation, not an authoritative reading.
  domain: "transport"
  tags: ["maritime", "decarbonisation", "innovate-uk", "cmdc7", "requirements", "demo"]
  is_demo: true
```

---

## Required claims

```yaml
required_claims:
  - claim_role: requires
    claim_domain: capability
    claim_text: >
      The technology must demonstrably contribute to maritime decarbonisation,
      whether through propulsion (alternative fuels, electrification, wind
      assistance), shore-side infrastructure, or operational efficiency.
    conditions: >
      Decarbonisation pathway must be quantified — not just claimed
    confidence_tier: ai_inferred
    confidence_reason: >
      Derived from CMDC 7 call description and UK Maritime Decarbonisation
      Strategy (already in atlas.knowledge_documents). The call repeatedly
      foregrounds emissions reduction as core selection criterion.
    source_excerpt: >
      "Innovative clean maritime technologies" — call title and DfT
      framing of the £121m envelope.

  - claim_role: requires
    claim_domain: evidence
    claim_text: >
      Strand-specific TRL evidence. Feasibility strand: TRL 4-6 with
      modelling and laboratory validation. Pre-deployment strand: TRL 5-7
      with prototype operation in representative environment.
      Deployment strand: TRL 7+ with operational trial data and a
      route to commercial deployment.
    conditions: >
      TRL self-assessment must be defensible against TRL 9 framework
      definitions
    confidence_tier: ai_inferred
    confidence_reason: >
      TRL banding is standard Innovate UK practice and explicit in
      previous CMDC competitions. Specific bands inferred from
      strand naming.
    source_excerpt: >
      "Three strands of this competition" — call structure;
      "feasibility studies, pre-deployment trials, deployment trials"

  - claim_role: requires
    claim_domain: regulatory
    claim_text: >
      MCA (Maritime and Coastguard Agency) regulatory engagement is
      required at a level proportionate to the strand. Deployment
      strand requires demonstrable MCA approval pathway; feasibility
      strand requires MCA-credible argumentation only.
    conditions: >
      UK waters operations
    confidence_tier: ai_inferred
    confidence_reason: >
      MCA regulatory engagement is a recurring requirement across
      previous CMDC competitions. Strand-proportionality is inferred.
    source_excerpt: >
      Standard practice from CMDC 1-6 history; no MCA reference
      explicit in current call text.

  - claim_role: requires
    claim_domain: evidence
    claim_text: >
      UK port partnership evidence. Deployment strand expects letters
      of intent or operational agreements with at least one UK port.
      Pre-deployment strand expects engagement evidence at a minimum.
    conditions: >
      UK ports specifically; non-UK port partnerships do not satisfy
      this requirement
    confidence_tier: ai_inferred
    confidence_reason: >
      UK industrial strategy framing is explicit in CMDC. Port
      partnerships are the standard evidence form for maritime
      deployment readiness.
    source_excerpt: >
      "UK registered organisations can apply" — call eligibility;
      historical CMDC pattern of UK-port-anchored projects.

  - claim_role: requires
    claim_domain: capability
    claim_text: >
      Vessel category and operational profile specificity. The proposal
      must identify the target vessel class (cargo, passenger, fishing,
      tug, etc.) and operational profile (route, duty cycle, fuel
      pattern). Generic "applicable to maritime" framing is insufficient.
    conditions: >
      Specific vessel class identified; operational profile characterised
    confidence_tier: ai_inferred
    confidence_reason: >
      Specificity is consistently rewarded in CMDC assessment.
      Generic claims have historically scored poorly.
    source_excerpt: >
      Inferred from CMDC assessment patterns; not explicit in
      current call text.

  - claim_role: requires
    claim_domain: evidence
    claim_text: >
      Lifecycle emissions accounting. Total emissions reduction must
      be quantified across the technology's lifecycle, not just at
      operational point-of-use.
    conditions: >
      Lifecycle methodology consistent with UK Government Carbon
      Accounting (or equivalent international standard if justified)
    confidence_tier: ai_inferred
    confidence_reason: >
      Lifecycle accounting is increasingly standard in UK
      decarbonisation funding. CMDC has progressively raised
      this bar across competition iterations.
    source_excerpt: >
      Reading of UK Maritime Decarbonisation Strategy alongside
      CMDC trajectory.
```

---

## CICERONE narrative anchors for this pack

**Beat 1 — Frame the inversion**
> "We've been looking at evidence and asking 'what does this match.' Let's flip it. Take a real open call — Innovate UK Clean Maritime Demonstration Competition 7, £121m, deadline 15 July 2026. Three strands at different readiness levels. We'll work backwards from the call to ask: what would the evidence picture need to look like for an SME to be competitive?"

**Beat 2 — Show the call (orient)**
> [renders live call card] "Here's the call. Three strands — feasibility at TRL 4-6, pre-deployment at TRL 5-7, deployment at TRL 7+. £121m across all three. Notice what the call says explicitly and what it doesn't."

**Beat 3 — Surface the requirements (the work)**
> "The platform reads the call alongside relevant doctrine — UK Maritime Decarbonisation Strategy, prior CMDC competitions, MCA regulatory framework — and produces a structured requirements profile. Six required claims surface."
>
> [renders the six required claims]
>
> "Notice the confidence tier on each — most are AI-inferred, not authoritative. The platform is offering a structured interpretation of what the call seems to want, with citations back to the source material. The final assessment will be done by the panel; this is a thinking partner for the SME, not a replacement for reading the call carefully."

**Beat 4 — Now run the matching the other way (the lift)**
> "Now we have a requirements profile. Let's run forward matching — see who in the existing project corpus has evidence that lines up with these requirements. We'll get a list of organisations and prior projects that have generated evidence shaped like the call wants. That's a starting point for partnership conversations."
>
> [renders matched evidence holders, ordered by match score]

**Beat 5 — Honest hedge**
> "This whole exercise is a structured interpretation, not an authoritative reading. The actual assessment criteria might weight things differently. But for an SME deciding whether to invest the time in a CMDC submission, this view tells them: here's what the call seems to want, here's who already has evidence shaped like it, here's where they'd need to fill gaps. That's faster than reading the call cold."

**Beat 6 — The D&D resonance**
> "If you read Alex's landscape survey, this is operationally close to what he describes as Layer 6 portability guidance — except inverted. Instead of 'what does this evidence allow', it's 'what would this requirement want.' Same structural reasoning, opposite direction. The platform doesn't formally implement Alex's framework, but solving call-matching has produced something that does adjacent work."

---

## Why this pack matters for v1.0

You initially suggested deferring Pack 4 to v1.1. Then you said: "test everything, weakness is signal not failure." This is precisely the kind of pack that benefits from being live in v1.0:

- If the reverse-direction reasoning produces strong, useful requirements profiles → demo win
- If it produces weak or generic requirements → narratable as "the platform is better at evidence-out than call-in, here's why" — a real product insight
- If the live forward matching from the generated requirements produces interesting candidate partners → demo win
- If it doesn't → narratable as "the project corpus is shallow on UK maritime, here's where Atlas would need to grow"

Either outcome is signal. Holding Pack 4 back denies CICERONE a chance to show its analytical voice (not just its matching voice).

---

## Validation discipline

Same as Packs 1-3, plus:

**Pack 4 needs the anchor call to remain open during the demo period.** CMDC 7 closes 15 July 2026. After that:

- Either swap to a fresh open Innovate UK or Horizon Europe call with similar shape
- Or rewrite the narrative to use a closed call as a retrospective ("here's what the platform would have said about CMDC 7 before its deadline")

Track the anchor call's status as part of pack metadata: `anchor_call_status_check_date`.

---

## Drafting notes

The required claims here are **AI-inferred from call descriptions and adjacent doctrine** rather than self-reported by an evidence holder. This is a deliberate choice — it distinguishes Pack 4's `requirements_profile` from Pack 2's `requirements_profile` (which represents an operator's actual procurement requirements).

Both are valid uses of the `requirements_profile` passport type, but they have different epistemic status:
- Pack 2 requirements: an operator's stated needs (self-reported)
- Pack 4 requirements: a platform interpretation of a call's evidence expectations (AI-inferred from public material)

CICERONE should be explicit about the distinction during demos to maintain the confidence-tier discipline that's central to the agent's voice.
