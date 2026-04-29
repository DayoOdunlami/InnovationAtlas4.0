# Demo Evidence Pack 1 — "Sarah" (Canonical Happy Path)
## CICERONE demo evidence | Pack ID: `demo_pack_sarah_gps_rail_uas`

**Status:** Draft v0.1 | Awaiting recon ratification before ingestion
**Schema target:** `atlas_demo.passports`, `atlas_demo.passport_claims`
**Last validated against corpus:** Pending — to run after ingestion

---

## Pack-level metadata

```yaml
pack_id: demo_pack_sarah_gps_rail_uas
scenario_key: sarah_evidence_workflow
title: "GPS-Denied Rail UAS Trial — TRL 6"
description: >
  Sarah is an SME with rail tunnel navigation evidence. 847 hours of trial
  data showing 94.7% accuracy in GPS-denied environments. Held NRIL HAZOP
  approval but no CAA or MCA. This pack walks audiences through the canonical
  evidence-to-passport-to-matching flow.
linked_scenario: sarah_evidence_workflow
sector_origin: ["rail"]
sector_target: ["rail", "maritime", "hit"]  # cross-sector ambitions
trl_level: 6
narrative_use:
  - "First-time audience meeting CICERONE"
  - "Demonstrating evidence → claim extraction"
  - "Demonstrating cross-sector matching surprise"
audience_fit: ["passport_curious", "general_cpc"]
expected_signature_matches:
  live_calls:
    - "RSSB Rail Infrastructure Carbon Conventions"
    - "Autonomous vessels in short sea shipping and inland waterways"
    - "Non-exhaust emissions in road and railway transport"
  projects:
    - "RAPPID (Real-time AI enabled rail track inspection)"
    - "Commercial UAV geolocation"
    - "QT-PRI (Quantum for Railway Infrastructure)"
median_match_score_target: 0.30
top_match_score_target: 0.40
```

---

## Passport definition

```yaml
passport:
  passport_type: evidence_profile
  title: "GPS-Denied Rail UAS Trial 2025 (Demo)"
  owner_org: "Sarah's Rail Inspection Ltd"
  owner_name: "Sarah (composite SME)"
  summary: >
    Autonomous UAS system for rail tunnel inspection with documented
    LiDAR-based localisation enabling navigation in GPS-denied environments.
    847 trial flight hours completed across UK rail tunnels. NRIL HAZOP
    approved for rail operations. No aviation or maritime regulatory
    coverage held.
  context: >
    Trials conducted across three UK rail operators between January and
    October 2025. Tunnel diameters tested 3.8m to 8.2m. Operating
    temperature envelope -5°C to +42°C. All trials under planned line
    closure with no live train interference.
  trl_level: 6
  trl_target: 8
  sector_origin: ["rail"]
  sector_target: ["rail", "hit", "maritime"]
  approval_body: "NRIL"
  approval_ref: "NRIL-HAZOP-2025-0341"
  approval_date: "2025-09-12"
  valid_conditions: >
    Validity contingent on planned line closure operations only;
    no concurrent traffic. Tunnel diameter range 3.8–8.2m. Operating
    temperature -5°C to +42°C.
  trial_date_start: "2025-01-15"
  trial_date_end: "2025-10-30"
  domain: "transport"
  tags: ["GPS-denied", "rail", "UAS", "tunnel", "autonomy", "HAZOP", "navigation", "demo"]
  is_demo: true   # required field on atlas_demo schema
```

---

## Claims (8)

```yaml
claims:
  - claim_role: asserts
    claim_domain: performance
    claim_text: >
      The system achieved 94.7% navigation accuracy in GPS-denied tunnel
      environments across 847 trial flight hours.
    conditions: >
      GPS-denied tunnel environments only; tunnel diameters 3.8–8.2m;
      operating temperature -5°C to +42°C
    confidence_tier: self_reported
    confidence_reason: >
      Figure is operator-stated and supported by trial logs. Has not been
      independently verified against test methodology or third-party
      assessment. Verification pathway: independent audit of LiDAR
      localisation accuracy under controlled conditions.
    source_excerpt: >
      "94.7% navigation accuracy was sustained across 847 flight hours
      in GPS-denied tunnel conditions"

  - claim_role: asserts
    claim_domain: evidence
    claim_text: >
      Zero safety incidents were recorded across 847 flight hours
      during the trial period (Jan–Oct 2025).
    conditions: >
      Trial conditions only; planned line closure operations; no live
      train interference
    confidence_tier: self_reported
    confidence_reason: >
      Self-reported incident count. Not yet corroborated by independent
      safety records or third-party audit. Can be strengthened by
      providing trial safety logs and incident report attestations.
    source_excerpt: >
      "Zero safety incidents across 847 flight hours of operational trials"

  - claim_role: asserts
    claim_domain: certification
    claim_text: >
      NRIL HAZOP approval is held for rail operations under the reference
      NRIL-HAZOP-2025-0341, dated September 2025.
    conditions: >
      Rail operations only; approval scope limited to NRIL HAZOP framework
      under planned line closure
    confidence_tier: self_reported
    confidence_reason: >
      Certification reference is operator-stated. Scope, conditions, and
      current validity have not been independently confirmed. Verification:
      direct attestation from NRIL.
    source_excerpt: >
      "NRIL HAZOP approval held for rail operations only
      (ref: NRIL-HAZOP-2025-0341)"

  - claim_role: requires
    claim_domain: capability
    claim_text: >
      The system requires GPS-denied tunnel environments within the
      validated operating envelope; performance outside this envelope
      is not claimed and would require additional validation.
    conditions: >
      GPS-denied conditions; rail tunnel environments within the validated
      operating envelope
    confidence_tier: ai_inferred
    confidence_reason: >
      Capability inferred from the operating envelope claims. Independent
      sensor specifications and navigation methodology have not yet been
      provided to substantiate the underlying capability.
    source_excerpt: >
      "LiDAR-based localisation enabling navigation in GPS-denied environments"

  - claim_role: constrains
    claim_domain: performance
    claim_text: >
      The validated operating temperature envelope is -5°C to +42°C.
      Performance outside this range has not been validated.
    conditions: >
      Operating envelope validated during this trial only; performance
      outside this range is not claimed
    confidence_tier: self_reported
    confidence_reason: >
      Temperature range is self-reported as validated. No independent
      test methodology, standard, or certifying body has been cited.
    source_excerpt: >
      "Operating envelope validated from -5°C to +42°C"

  - claim_role: constrains
    claim_domain: performance
    claim_text: >
      The system has been validated for tunnels with diameters
      3.8m to 8.2m. Performance in tunnels outside this range
      is not claimed.
    conditions: >
      Tunnel diameter range 3.8–8.2m only
    confidence_tier: self_reported
    confidence_reason: >
      Validated diameter range is self-reported. Has not been
      corroborated by independent structural or operational test
      documentation.
    source_excerpt: >
      "Tunnel diameters 3.8–8.2m"

  - claim_role: constrains
    claim_domain: regulatory
    claim_text: >
      No CAA (Civil Aviation Authority) approval is held for this system.
      Aviation deployment would require fresh regulatory engagement.
    conditions: null
    confidence_tier: self_reported
    confidence_reason: >
      Self-reported absence of certification. Current regulatory status
      may change and has not been independently verified.
    source_excerpt: >
      "No MCA or CAA approval held"

  - claim_role: constrains
    claim_domain: regulatory
    claim_text: >
      No MCA (Maritime and Coastguard Agency) approval is held for this
      system. Maritime deployment would require fresh regulatory engagement.
    conditions: null
    confidence_tier: self_reported
    confidence_reason: >
      Self-reported absence of certification. Current regulatory status
      may change and has not been independently verified.
    source_excerpt: >
      "No MCA or CAA approval held"
```

---

## CICERONE narrative anchors for this pack

When a user invokes the Sarah scenario, CICERONE has these narrative beats available:

**Beat 1 — Evidence intake (orient)**
> "Imagine Sarah comes to us with raw evidence: a trial report covering 847 flight hours, a HAZOP certificate from NRIL, and operating notes about the tunnel conditions. Three documents, no structure beyond what's on the page. Watch what JARVIS would do here — and notice what it *doesn't* do."

**Beat 2 — Claim extraction (mid)**
> "JARVIS extracts eight structured claims from those documents. Notice the shape: each one has a role (`asserts`/`requires`/`constrains`), a domain (`performance`/`evidence`/`certification`/`regulatory`), conditions, and a source excerpt. Two of those claims are *negative* — Sarah doesn't have CAA or MCA approval. That's a deliberately honest piece of structure that most marketing material would hide."

**Beat 3 — Cross-sector surprise (the lift)**
> "Now watch the matching. Sarah's evidence is rail. But the top match is *Autonomous vessels in short sea shipping*. Why? The platform spotted that GPS-denied autonomous navigation is a transferable capability. The matching algorithm doesn't know maritime is a different sector — it knows the language is similar. Sarah might never have looked at maritime calls. This is what evidence portability looks like in practice."

**Beat 4 — Honest gap (the credibility move)**
> "But notice — the top match score is 0.43, not 0.85. The platform isn't pretending Sarah is shovel-ready for that maritime call. The gap analysis tells her exactly what's missing: MCA approval, marine operating envelope, salt-water tolerance. That gap analysis is the Layer 6 portability guidance Alex's landscape survey says needs to be invented. We've already built an early form of it."

**Beat 5 — Handoff offer**
> "If you wanted to actually do this for real with Sarah's real evidence, you'd be in JARVIS — that's where persistent passports get authored and matched. I've shown you what the workflow looks like with a worked example. Want me to hand off to JARVIS, or shall we explore one of the other scenarios?"

---

## Validation discipline

After ingestion to `atlas_demo`:

1. Run the matching pipeline against `atlas.live_calls` and `atlas.projects`
2. Capture top 15 matches and their scores into `pack_validation.expected_matches`
3. Compare to the `expected_signature_matches` listed in pack metadata
4. If signature matches don't appear in top 15: pack needs revision before any external demo
5. Set `last_validated_at` timestamp on the pack
6. Re-validate any time the corpus is materially updated (new live call ingestion, embedding model change)

---

## Drafting notes

This pack mirrors Sarah's existing passport (`853a783d-f44e-49b6-95f8-c74da6670f27` in `atlas.passports`) closely. The decision is: do we copy that passport's content verbatim into `atlas_demo.passports`, or author a fresh demo passport that is similar but distinguishable? My instinct is **author fresh** — slightly different SME name, different trial date range, different reference numbers — so the demo and production passports never get confused even if someone joins their schemas in error.

The composite SME framing ("Sarah's Rail Inspection Ltd") makes clear this is illustrative. Real SMEs are not represented.
