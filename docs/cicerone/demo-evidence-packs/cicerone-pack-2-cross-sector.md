# Demo Evidence Pack 2 — "Port Auto" (Cross-Sector Transfer Probe)
## CICERONE demo evidence | Pack ID: `demo_pack_port_to_rail_freight`

**Status:** Draft v0.1 | Awaiting recon ratification before ingestion
**Schema target:** `atlas_demo.passports` (×2), `atlas_demo.passport_claims`, `atlas_demo.passport_gaps`
**Last validated against corpus:** Pending

---

## Pack-level metadata

```yaml
pack_id: demo_pack_port_to_rail_freight
scenario_key: cross_sector_transfer_probe
title: "Maritime port automation → rail freight depot transfer probe"
description: >
  An autonomous container handling system has 18 months of operational
  evidence at a UK maritime port. The operator wants to know whether
  that evidence transfers to a rail freight depot context. This pack
  contains a paired evidence_profile (port) and requirements_profile
  (rail freight depot) and demonstrates the gap analysis the platform
  produces between them.
linked_scenario: cross_sector_transfer_probe
sector_origin: ["maritime"]
sector_target: ["rail", "hit"]
trl_level: 7  # well-tested in maritime, untested in rail
narrative_use:
  - "Demonstrating Layer 6 portability gap analysis"
  - "D&D-curious audiences who care about evidence transfer"
  - "Operationalising the trust-transfer problem"
audience_fit: ["passport_curious", "dd_adjacent"]
expected_signature_matches:
  live_calls:
    - "Clean Maritime Demonstration Competition 7 (Innovate UK)"
    - "Autonomous vessels in short sea shipping and inland waterways"
    - "Port automation Horizon Europe calls"
  projects:
    - "Rail freight automation projects"
    - "Container handling research"
expected_signature_gaps:
  - "Different floor surface tolerance (concrete pad → freight yard ballast)"
  - "Track-side hazard model differs from quay-side"
  - "ORR (Office of Rail and Road) regulatory framework not held"
  - "Cybersecurity certification scope (BS EN 62443) covers maritime control systems only"
  - "Crane/freight equipment integration vs container/vessel integration"
median_match_score_target: 0.32
top_match_score_target: 0.45
```

---

## Passport A — Evidence profile (Port automation)

```yaml
passport_a:
  passport_type: evidence_profile
  title: "Autonomous Container Handling — Port Operations Evidence (Demo)"
  owner_org: "PortAuto Systems (composite SME)"
  owner_name: "Composite operator"
  summary: >
    Autonomous container handling system deployed across two UK ports
    over 18 months. 14,200 container movements completed without
    operator intervention. Held DfT Maritime safety case approval.
    Cybersecurity certified to BS EN 62443 for maritime control systems.
  context: >
    Trials conducted at two operational UK ports between October 2023
    and April 2025. Concrete pad surface conditions; quay-side hazard
    model; integration with vessel scheduling systems and customs
    workflows. Operating temperature -8°C to +38°C (UK port climate).
    All operations under designated automation zones with safety perimeter.
  trl_level: 7
  trl_target: 8
  sector_origin: ["maritime"]
  sector_target: ["rail", "hit"]
  approval_body: "DfT Maritime"
  approval_ref: "DFT-MAR-AUTOM-2024-117"
  approval_date: "2024-03-22"
  valid_conditions: >
    Validity scoped to designated port automation zones with concrete
    pad surface, established safety perimeter, and existing vessel
    scheduling integration.
  trial_date_start: "2023-10-01"
  trial_date_end: "2025-04-30"
  domain: "transport"
  tags: ["maritime", "port", "autonomy", "container-handling", "BS-EN-62443", "demo"]
  is_demo: true
```

### Claims for Passport A

```yaml
claims_a:
  - claim_role: asserts
    claim_domain: performance
    claim_text: >
      The system completed 14,200 container movements across two UK
      ports without operator intervention during the 18-month trial.
    conditions: >
      Designated automation zones; concrete pad surface; quay-side
      operations; vessel-scheduling integrated workflows
    confidence_tier: self_reported
    confidence_reason: >
      Movement count is operator-stated and supported by port
      operational logs. Independent audit pending.
    source_excerpt: >
      "14,200 container movements across two UK ports completed
      autonomously over the trial period"

  - claim_role: asserts
    claim_domain: certification
    claim_text: >
      BS EN 62443 cybersecurity certification is held for the maritime
      control systems integrated with the autonomous handling platform.
    conditions: >
      Certification scoped to maritime port control systems only;
      does not extend to other sector control system integrations
    confidence_tier: self_reported
    confidence_reason: >
      Certification reference is operator-stated. Scope explicitly
      maritime — does not pre-qualify deployment in other sectors.
    source_excerpt: >
      "BS EN 62443 certified for maritime control system scope"

  - claim_role: asserts
    claim_domain: certification
    claim_text: >
      DfT Maritime safety case approval (DFT-MAR-AUTOM-2024-117)
      covers autonomous handling operations under defined zones.
    conditions: >
      Maritime port operations only; designated automation zones
      with established safety perimeter
    confidence_tier: self_reported
    confidence_reason: >
      Approval reference operator-stated. Scope is maritime only —
      does not pre-qualify rail or road deployments.
    source_excerpt: >
      "DfT Maritime safety case approval ref DFT-MAR-AUTOM-2024-117"

  - claim_role: requires
    claim_domain: capability
    claim_text: >
      The system requires concrete pad operating surface and a
      defined safety perimeter; floor surface variability outside
      this scope has not been validated.
    conditions: >
      Concrete pad; static safety perimeter; controlled access
    confidence_tier: self_reported
    confidence_reason: >
      Surface and perimeter requirements are stated in the trial
      design. Tolerance to alternative surface types (ballast,
      gravel, mixed yard surfaces) has not been characterised.
    source_excerpt: >
      "Operations validated under concrete pad surface conditions
      with established static safety perimeter"

  - claim_role: requires
    claim_domain: capability
    claim_text: >
      Integration with vessel scheduling systems is required for
      autonomous workflow operation in the validated configuration.
    conditions: >
      Vessel scheduling integration via maritime control system APIs
    confidence_tier: self_reported
    confidence_reason: >
      Integration is part of the trial system configuration.
      Equivalent integration in other sectors (rail freight planning,
      road freight scheduling) has not been demonstrated.
    source_excerpt: >
      "System operates in integration with vessel scheduling and
      customs workflows"

  - claim_role: constrains
    claim_domain: performance
    claim_text: >
      Validated operating temperature envelope is -8°C to +38°C
      (UK port climate range). Performance outside this range
      is not claimed.
    conditions: >
      Trial operating envelope only
    confidence_tier: self_reported
    confidence_reason: >
      Range reflects observed UK port operating conditions.
      Cold storage, desert, or tropical conditions out of scope.
    source_excerpt: >
      "Operating envelope -8°C to +38°C as observed during trials"

  - claim_role: constrains
    claim_domain: regulatory
    claim_text: >
      No ORR (Office of Rail and Road) approval is held. Rail-side
      deployment would require fresh regulatory engagement.
    conditions: null
    confidence_tier: self_reported
    confidence_reason: >
      Operator confirms no rail regulatory engagement to date.
    source_excerpt: >
      "Maritime regulatory scope only — no rail authority approval held"
```

---

## Passport B — Requirements profile (Rail freight depot)

```yaml
passport_b:
  passport_type: requirements_profile
  title: "Rail Freight Depot Automation — Operating Requirements (Demo)"
  owner_org: "Composite UK Rail Freight Operator"
  owner_name: "Procurement context (composite)"
  summary: >
    Operating requirements for an autonomous container handling system
    deployable in a UK rail freight depot context. Specifies floor
    surface tolerance (mixed yard surfaces), trackside hazard model,
    ORR regulatory engagement, scheduling integration with rail
    freight planning systems, and BS EN 62443 cybersecurity scope
    extended to rail control systems.
  context: >
    Requirements drawn from a composite UK rail freight depot operating
    context. Mixed yard surfaces (concrete, ballast, transitional zones).
    Trackside hazard model includes live track adjacency, overhead line
    equipment proximity in some depots, and shunting movements.
  trl_target: 8  # required readiness level
  sector_target: ["rail", "hit"]
  approval_body: "ORR"
  valid_conditions: >
    Requirements assume UK rail freight depot operations under ORR
    regulatory framework. Trackside hazard model based on UK rail
    operational standards.
  domain: "transport"
  tags: ["rail-freight", "depot", "requirements", "ORR", "demo"]
  is_demo: true
```

### Claims for Passport B (the requirements)

```yaml
claims_b:
  - claim_role: requires
    claim_domain: capability
    claim_text: >
      The system must operate across mixed yard surface types including
      concrete, ballast, and transitional zones.
    conditions: >
      UK rail freight depot environments; surface tolerance demonstrated
      across the typical depot surface mix
    confidence_tier: ai_inferred
    confidence_reason: >
      Requirement derived from typical UK depot operating context.
      Specific tolerance thresholds will need operator-specific
      definition.
    source_excerpt: >
      "Requirement: operate across the surface variability typical
      of UK freight yards"

  - claim_role: requires
    claim_domain: capability
    claim_text: >
      The system must operate within a trackside hazard model that
      includes live track adjacency and shunting movement awareness.
    conditions: >
      UK rail depot environments where automated zones may abut
      operational track
    confidence_tier: ai_inferred
    confidence_reason: >
      Derived from typical UK rail freight depot risk profile.
      Specific zone configurations will vary by operator.
    source_excerpt: >
      "Trackside hazard model required: live track adjacency,
      overhead line equipment proximity, shunting awareness"

  - claim_role: requires
    claim_domain: regulatory
    claim_text: >
      ORR (Office of Rail and Road) approval is required for rail-side
      autonomous operations. Equivalent maritime approval does not
      transfer.
    conditions: >
      UK rail operations
    confidence_tier: ai_inferred
    confidence_reason: >
      ORR jurisdiction is well established for UK rail operations.
      Maritime safety case approvals are scoped to DfT Maritime
      and do not pre-qualify rail-side deployment.
    source_excerpt: >
      "Rail-side autonomous operations require ORR engagement
      and approval"

  - claim_role: requires
    claim_domain: capability
    claim_text: >
      Integration with rail freight scheduling systems is required.
      Maritime vessel scheduling integration is not equivalent.
    conditions: >
      UK rail freight planning environments
    confidence_tier: ai_inferred
    confidence_reason: >
      Rail freight scheduling differs structurally from vessel
      scheduling. Direct API equivalence is not assumed.
    source_excerpt: >
      "Integration with rail freight planning and shunting workflow
      systems required"

  - claim_role: requires
    claim_domain: certification
    claim_text: >
      BS EN 62443 cybersecurity certification scope must extend to
      rail control systems. Maritime-only scope is insufficient.
    conditions: >
      Rail-side control system integration
    confidence_tier: ai_inferred
    confidence_reason: >
      BS EN 62443 is scope-specific. Maritime certification does
      not automatically extend to other sectors.
    source_excerpt: >
      "BS EN 62443 certification scope must cover rail control
      system integration"
```

---

## Gap analysis (between Passport A and Passport B)

These are the gaps CICERONE will narrate when walking through the cross-sector transfer scenario. They mirror the structure already in `atlas.passport_gaps`.

```yaml
gaps:
  - gap_type: conditions_mismatch
    severity: blocking
    gap_description: >
      Evidence operating surface (concrete pad) does not cover the
      requirement of mixed yard surfaces (concrete, ballast,
      transitional zones). Surface tolerance characterisation
      across the wider depot surface mix is missing.
    addressable_by: >
      Trial extension to characterise performance across ballast
      and transitional surfaces; or rail-depot pilot under
      controlled conditions to establish surface tolerance.

  - gap_type: missing_evidence
    severity: blocking
    gap_description: >
      Trackside hazard model differs from quay-side. Live track
      adjacency, overhead line equipment proximity, and shunting
      movement awareness are not addressed in the maritime evidence
      base.
    addressable_by: >
      Hazard model extension and pilot trial in a rail-depot
      environment; engagement with RSSB on equivalence framing.

  - gap_type: certification_gap
    severity: blocking
    gap_description: >
      ORR regulatory engagement has not occurred. DfT Maritime
      safety case approval does not transfer to rail-side operations.
    addressable_by: >
      Initiate ORR engagement; develop a rail-side safety case;
      consider whether elements of the maritime safety case can
      be reused as evidence (rather than as approval).

  - gap_type: certification_gap
    severity: significant
    gap_description: >
      BS EN 62443 cybersecurity certification scope is maritime-only.
      Extension to rail control systems requires fresh certification
      activity.
    addressable_by: >
      Extend BS EN 62443 certification scope; or obtain rail-specific
      cybersecurity certification (CEng-rail equivalent).

  - gap_type: missing_evidence
    severity: significant
    gap_description: >
      Integration is demonstrated against vessel scheduling systems.
      Equivalent integration with rail freight planning and shunting
      workflow systems has not been demonstrated.
    addressable_by: >
      Pilot integration with a rail freight scheduling environment;
      document API equivalence and gaps.

  - gap_type: trl_gap
    severity: minor
    gap_description: >
      Maritime trial achieved TRL 7. The rail freight requirement
      is TRL 8 readiness. A controlled rail-depot pilot would
      bridge this gap.
    addressable_by: >
      Targeted rail-depot pilot to lift evidence to TRL 8 in the
      rail freight context.
```

---

## CICERONE narrative anchors for this pack

**Beat 1 — Frame the problem**
> "Imagine a maritime port automation operator with 18 months of evidence wanting to know whether that evidence transfers to a rail freight depot. The naive answer is 'autonomous handling is autonomous handling — it should work.' Watch what the platform actually says."

**Beat 2 — Show both passports side by side**
> [renders side-by-side comparison] "Two passports — one carries evidence from the maritime context, the other carries the requirements for rail freight. What we want to know is: where does the evidence cover the requirements, and where doesn't it?"

**Beat 3 — Walk through the gaps (the demo moment)**
> "Six gaps surface. Three are blocking — surface tolerance, trackside hazard model, ORR regulatory engagement. Three are addressable through targeted pilots and certification scope extensions. The platform isn't saying the evidence doesn't transfer — it's saying *here is precisely what would need to be added* for it to transfer."

**Beat 4 — The Layer 6 connection (for D&D audiences)**
> "Alex Gluhak's landscape survey for D&D describes Layer 6 portability guidance — *what transfers, what needs local verification* — as one of three contributions where the Innovation Evidence Profile needs to be invented from scratch. Atlas didn't try to invent that framework. But solving cross-sector matching produced something operationally similar. The platform has been doing an early form of Layer 6 since the gap-analysis feature went live."

**Beat 5 — Honest hedge**
> "These gaps are AI-inferred from passport content, not verified by an independent assessor. They give an operator a structured starting point for the conversation with ORR, with RSSB, with potential pilot partners. They don't replace that conversation. That's the same posture D&D's framing takes — the Passport facilitates decision-making, it doesn't make the decision."

---

## Validation discipline

Same as Pack 1, plus:
- Gap analysis output must be regenerated against the live `atlas_demo.passports` after ingestion (not pre-canned)
- The gaps listed in this pack are *expected* gaps — actual gaps come from running the matching/gap-analysis pipeline
- If actual gaps diverge materially from expected: pack needs revision OR matching pipeline has shifted (investigate which)
