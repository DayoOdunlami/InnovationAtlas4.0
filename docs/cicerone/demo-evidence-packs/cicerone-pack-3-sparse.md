# Demo Evidence Pack 3 — "Decarb" (Sparse-Corpus Edge Case)
## CICERONE demo evidence | Pack ID: `demo_pack_uk_bus_decarb_sparse`

**Status:** Draft v0.1 | Awaiting recon ratification before ingestion
**Schema target:** `atlas_demo.passports`, `atlas_demo.passport_claims`
**Last validated against corpus:** Pending

---

## Pack-level metadata

```yaml
pack_id: demo_pack_uk_bus_decarb_sparse
scenario_key: corpus_limits_demonstration
title: "UK regional bus decarbonisation — corpus sparsity demonstration"
description: >
  Strong evidence pack focused on UK regional bus operator decarbonisation.
  Deliberately chosen because the corpus is thin in UK-specific bus and
  coach contexts — Horizon Europe coverage of buses is decent, but
  UK-only matching will be sparse. This pack demonstrates the
  "we know what we don't yet know" credibility move.
linked_scenario: corpus_limits_demonstration
sector_origin: ["hit"]  # Highways and Integrated Transport
sector_target: ["hit"]
trl_level: 7
narrative_use:
  - "Demonstrating honest corpus limits"
  - "Preventing the 'magic platform' impression"
  - "Setting up the corpus-can-grow narrative"
audience_fit: ["meta_curious", "general_cpc", "passport_curious"]
expected_signature_matches:
  live_calls:
    - "Demonstration of zero emission coaches and buses (Horizon Europe)"
  projects:
    - "Sparse — most strong UK bus decarb projects are not in current corpus"
expected_match_thinness:
  total_matches_above_03: "expected ≤ 3"
  total_matches_above_02: "expected ≤ 8"
median_match_score_target: 0.22
top_match_score_target: 0.35
narrative_purpose:
  - >
    Audience sees the platform return modest matches and CICERONE
    narrating *why*. This is more credible than always-strong matching.
```

---

## Passport definition

```yaml
passport:
  passport_type: evidence_profile
  title: "Regional Bus Battery Electric Conversion — UK Operator Trial (Demo)"
  owner_org: "RegionRoute Bus (composite UK operator)"
  owner_name: "Composite operator"
  summary: >
    Regional bus operator converted 18 vehicles (12-metre single-deck)
    from diesel to battery electric across two UK depots over 24 months.
    Evidence covers operational range, charging infrastructure utilisation,
    energy consumption per route, and total cost of ownership compared
    to diesel baseline. Held DVSA category certification. Specifically
    addressed UK regional bus operating context — multi-stop routes
    averaging 18-32km daily round-trip, depot-charged overnight.
  context: >
    Trial conducted across two UK regional depots (Yorkshire and Devon)
    between 2023 and 2025. Vehicles operated under standard regional
    bus service patterns. Charging infrastructure: 7×150kW DC chargers
    at each depot, overnight charging. Comparison data drawn from
    paired diesel baseline routes during the same period.
  trl_level: 7
  trl_target: 8
  sector_origin: ["hit"]
  sector_target: ["hit"]
  approval_body: "DVSA"
  approval_ref: "DVSA-CAT-2024-EV-0214"
  approval_date: "2024-06-15"
  valid_conditions: >
    UK regional bus operating context (12-metre single-deck, 18-32km
    daily round-trip routes, overnight depot charging). Cold weather
    operations validated to -7°C; performance below this not characterised.
  trial_date_start: "2023-03-01"
  trial_date_end: "2025-02-28"
  domain: "transport"
  tags: ["bus", "decarbonisation", "battery-electric", "uk-regional", "depot-charging", "demo"]
  is_demo: true
```

---

## Claims (6)

```yaml
claims:
  - claim_role: asserts
    claim_domain: performance
    claim_text: >
      Mean operational range of 178km per overnight charge across the
      trial fleet of 18 vehicles, against a fleet specification of 200km.
    conditions: >
      UK regional bus operating context; mean route profile;
      validated temperature range -7°C to +32°C
    confidence_tier: self_reported
    confidence_reason: >
      Range is from operational logs across the trial period.
      Independent audit of telemetry data not yet completed.
    source_excerpt: >
      "Mean operational range 178km / charge across the 18-vehicle fleet"

  - claim_role: asserts
    claim_domain: performance
    claim_text: >
      Energy consumption averaged 1.18 kWh/km across the trial fleet,
      with 22% variance between most and least efficient routes
      attributable to topographic and stop-density differences.
    conditions: >
      UK regional route profile; trial vehicle specification
    confidence_tier: self_reported
    confidence_reason: >
      Drawn from operational telemetry. Not normalised to a
      cross-operator benchmark.
    source_excerpt: >
      "Mean 1.18 kWh/km, route variance 22%"

  - claim_role: asserts
    claim_domain: evidence
    claim_text: >
      Total cost of ownership (TCO) over the 24-month trial was
      14% lower than the matched diesel baseline, with electricity
      cost volatility identified as the dominant residual risk.
    conditions: >
      UK regional bus context; comparison made under prevailing
      UK electricity tariff conditions during 2023-2025
    confidence_tier: self_reported
    confidence_reason: >
      TCO methodology is operator-internal. Independent benchmarking
      against a standardised TCO model not completed.
    source_excerpt: >
      "Trial TCO 14% below matched diesel baseline; electricity
      tariff volatility flagged as residual risk"

  - claim_role: asserts
    claim_domain: certification
    claim_text: >
      DVSA category certification (DVSA-CAT-2024-EV-0214) covers
      the converted vehicle category for UK regional bus operations.
    conditions: >
      Specific to converted vehicle specification
    confidence_tier: self_reported
    confidence_reason: >
      DVSA reference is operator-stated. Scope and validity
      can be confirmed via direct DVSA attestation.
    source_excerpt: >
      "DVSA category certification ref DVSA-CAT-2024-EV-0214"

  - claim_role: requires
    claim_domain: capability
    claim_text: >
      The validated configuration requires depot-based 150kW DC
      overnight charging infrastructure. On-route charging has
      not been characterised in this trial.
    conditions: >
      Depot infrastructure requirement; not validated for on-route
      or opportunity charging configurations
    confidence_tier: self_reported
    confidence_reason: >
      Trial configuration is depot-charging only. On-route
      configurations would require additional validation.
    source_excerpt: >
      "Depot 150kW DC overnight charging — on-route charging
      out of scope for this trial"

  - claim_role: constrains
    claim_domain: performance
    claim_text: >
      Cold weather operations validated to -7°C. Performance below
      this temperature has not been characterised.
    conditions: >
      Validated temperature range -7°C to +32°C
    confidence_tier: self_reported
    confidence_reason: >
      Operational temperature exposure during the trial did
      not extend below -7°C in either depot location.
    source_excerpt: >
      "Operating envelope -7°C to +32°C; performance outside
      this range not validated"
```

---

## CICERONE narrative anchors for this pack

**Beat 1 — Frame the question**
> "Let's look at a UK regional bus operator with 24 months of battery electric conversion evidence — fleet of 18 vehicles, two depots, real operational data. They want to know what funding might align."

**Beat 2 — Show the matching honestly (the credibility move)**
> [renders match results] "Notice what comes back. One strong match — the Horizon Europe Demonstration of zero emission coaches and buses call. After that, the matches thin out fast. Top score 0.35, median 0.22 — not strong."

**Beat 3 — Explain why (the corpus narrative)**
> "There are two reasons the matching is sparse. The first is that our corpus is heavy on Horizon Europe and thin on UK-specific bus and coach decarbonisation. The Innovate UK Clean Maritime Demonstration call you saw earlier? That's £121m and a strong match for marine evidence. There's no equivalent UK call for bus decarb in the current corpus. The second reason is that bus decarb is a relatively mature technology — most of the strong matches would be at deployment, not innovation, funding stages, and we don't index deployment procurement as deeply."

**Beat 4 — The honest constraint**
> "This is the kind of moment where the platform is most useful when it's honest. If I came back with five glowing matches at 0.85 each, you should be suspicious. What this view tells the operator is: explore Horizon Europe options, look at what local authority procurement is doing in your region (which we don't index richly), and recognise that the corpus we're working with is a sample, not a census."

**Beat 5 — The corpus-can-grow framing**
> "When D&D is fully scoping Testbed Britain, one of the questions is what evidence base sits underneath it. This is a small example of why corpus design matters. Our corpus today is shaped by what was easiest to ingest first — Horizon Europe scrapes well, UK procurement portals don't. The platform is genuinely useful where the corpus is rich. Where it's thin, we have to be honest about that. Atlas's value isn't omniscience; it's a thinking partner that knows where its own limits are."

**Beat 6 — Soft handoff to the wider platform conversation**
> "Want to see how this would look against a richer slice of the corpus — say, the maritime cross-sector pack? Or shall I show you how we'd build the corpus out for UK bus specifically?"

---

## Validation discipline

Same as Packs 1 and 2, with one specific addition:

**Sparsity preservation check.** Pack 3's value depends on matching being thin. If a future corpus update adds rich UK bus decarb coverage, this pack loses its narrative purpose. When that happens:

- Either retire the pack and replace with a different corpus-thin domain
- Or rewrite the narrative to be about corpus growth rather than corpus limits ("here's what Pack 3 looked like a year ago, and here's what the corpus has now learned to match")

Track this in pack metadata: `corpus_sparsity_assumption` and `last_sparsity_check_date`.

---

## Why this pack matters

The instinct when building demo evidence is to make every pack a strong showcase. Pack 3 deliberately doesn't. Here's why:

1. **Sophisticated audiences (Domas, Chris, Friso) will mistrust a platform that always produces strong matches.** A sparse-match scenario, narrated honestly, builds more credibility than three strong-match scenarios.

2. **Pack 3 sets up the corpus growth conversation.** When D&D asks "where would Atlas need to grow to support Testbed Britain's evidence work?" — Pack 3 is the answer. The thin places are visible.

3. **Pack 3 lets CICERONE demonstrate one of its core debate behaviours** — acknowledging when out of depth. Without a sparse-match scenario, the agent never gets to show that capability live.

This is intentional weakness as a demo strength.
