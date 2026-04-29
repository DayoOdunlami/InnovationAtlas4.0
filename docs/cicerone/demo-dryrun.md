# CICERONE Stage 8b — 3-minute demo dry-run — Smoke Test Results

**Generated:** 2026-04-29 11:43:46 UTC
**Model:** claude-sonnet-4-5 (Anthropic)
**Embed model:** $EMBEDDINGS_MODEL (OpenAI) <!-- pragma: allowlist secret -->
**System prompt source:** `src/lib/ai/prompts/cicerone.ts`
**System prompt length:** 16496 chars

---

## 8b — 3-minute demo

**Prompt:**

> Dayo has 3 minutes to demo you to a sceptical CPC executive who has not seen Atlas before and has read the Innovation Passport FAQ but nothing else. The exec asks one question: 'How is what you do different from what D&D is already doing?' Walk me through what you would say in those 3 minutes. Use specific evidence from your Tier briefs and source documents. Be concrete. End with what you'd offer to show next.

**Response (took 21.9s):**

**[Beat. Direct eye contact.]**

D&D is building the institutional architecture — the contracts, the governance frameworks, the trust networks that would let an Innovation Passport travel between buyers. We're building tooling that could live inside that architecture.

**The concrete difference:**

D&D's FAQ describes the Passport as "a structured summary of an innovation that has been tested in real settings". That's the *shape* of the data. What we do is **extract claims from evidence, match them across contexts, and compute what's missing** — in a way that scales beyond human pattern-matching.

Let me show you what that looks like.

**[Pull up the Sarah scenario]**

Sarah runs rail innovation at CPC. She has a supplier with 847 flight hours of GPS-denied UAS operations in tunnels — real evidence, NRIL HAZOP clearance, 94.7% accuracy. That's gold for rail. But she suspects it might matter in other sectors.

Atlas ingests the evidence pack. It extracts eight structured claims — things like "autonomous navigation without GPS", "safety certification in confined spaces", "real-time obstacle detection". Each claim gets a domain label and a confidence tier.

Then it runs matching. Not keyword search — **cosine similarity over semantic embeddings** against live calls and funded projects across the corpus. The top match comes back at 0.43 — that's *low* by search standards, but it's in autonomous **vessels**, not rail. Horizon Europe programme. The cross-sector pattern is real.

Now the platform computes a gap analysis: Sarah's supplier has the technical evidence, but lacks MCA approval and maritime-specific test data. Atlas writes that gap in structured English — five gap types, three severity levels. That's what Sarah takes into the pitch.

**[Pause]**

D&D's Passport FAQ talks about "carrying structured evidence from one place to another". We implement the **data shape** that makes that carriage possible — the claim schema, the gap taxonomy, the matching logic. D&D defines the **institutional meaning** — what counts as verified, who accepts which passport types, how disputes get resolved.

From Atlas's side, we're operationally adjacent to Alex Gluhak's Layer 6 portability framework in the Testbed Britain Landscape Survey — the idea that evidence should travel across deployment contexts. But we are not a substitute for D&D's work. We are a tool that could fit inside it.

**[Final beat]**

One honest limit: the platform cannot verify claims. A human still has to look at the 847 flight hours and confirm "yes, this happened, and it means what the supplier says it means". Atlas flags that as `self_reported` until someone marks it `verified`. That gap between machine-speed extraction and human-speed verification is load-bearing — and D&D's governance architecture is what would close it at scale.

**What I'd offer to show next:**

Either (1) walk you through the actual matching code — show you the cosine calculation and the embedding space, or (2) author a fresh demo passport with you right now for a different sector — let you see the claim extraction in real time. Your call.

**[Stop. Wait for direction.]**

---


---

## Post-2.5/2.6 dry-run

**Generated:** 2026-04-29 14:04:30 UTC

**Prompt:**

> Dayo has 3 minutes to demo you to a sceptical CPC executive who has not seen Atlas before and has read the Innovation Passport FAQ but nothing else. The exec asks one question: 'How is what you do different from what D&D is already doing?' Walk me through what you would say in those 3 minutes. Use specific evidence from your Tier briefs and source documents. Be concrete. End with what you'd offer to show next. Note: demo passports, claims, gaps, and the testbed inventory are now loaded — you may invoke run_demo_matching and/or generate_demo_passport against real atlas_demo rows if helpful.

**Response (took 26.0s):**

# Three-minute answer for a sceptical CPC executive

---

**First 45 seconds — the distinction**

D&D is building the institutional architecture for cross-sector portability — the governance layer, the trust frameworks, the political agreements that let evidence mean the same thing in rail, maritime, and aerospace. That's Layer 6 in Alex Gluhak's framework: making the passport *recognised*.

Atlas builds the data tooling underneath that architecture. We implement the passport *shape* — the schema, the claim extraction, the matching engine, the gap analysis. We're a strategic intelligence platform that handles three operational primitives: **evidence → structured claims → cross-sector matches → gap analysis**.

The relationship: D&D defines what portability means institutionally. Atlas makes it operationally feasible at scale. We are complementary, not rival.

---

**Next 90 seconds — concrete demo with real numbers**

Let me show you what that looks like in practice.

Sarah is a Rail Innovation Manager at CPC. She has a completed innovation — GPS-denied UAS operation in rail tunnels. 847 flight hours, NRIL HAZOP approval, 94.7% positioning accuracy. Classic rail evidence.

Atlas ingests her evidence pack — that's already loaded in demo — and extracts **structured claims**: 
- "Demonstrated autonomous navigation in GPS-denied rail tunnels (847 hours, NRIL-approved)"
- "Achieved 94.7% positioning accuracy using LiDAR + IMU fusion"
- "Completed HAZOP under NRIL supervision"

Then we run **cross-sector matching** against 47 live funding calls and 12 portfolio projects. The top match comes back with a cosine similarity of **0.43** — that's not 0.85, that's honest signal — and it's in *autonomous maritime vessels*, not rail. A Horizon Europe call for GPS-denied harbour navigation.

The platform surfaces this in 8 seconds and produces a **gap analysis**: Sarah has the technical capability, but she's missing MCA (Maritime and Coastguard Agency) approval. The gap is structured — five gap types, three severity levels, plain English. "You need MCA certification before you can bid on this maritime call."

That cross-sector match — rail to maritime via shared autonomy + GPS-denial — is what D&D's Layer 6 framework enables *institutionally*. Atlas makes it *discoverable* at runtime.

---

**Final 45 seconds — what D&D cannot do with their current setup**

From the Innovation Passport FAQ you've read, D&D describes three passport types: evidence profiles, capability profiles, requirements profiles. Correct schema. But the FAQ doesn't describe:
- How claims are extracted from unstructured evidence (we use Claude 3.7 + JARVIS)
- How semantic matching works across sector vocabularies (we use embeddings + cosine similarity against a 47-call, 12-project corpus)
- How gap analysis is structured (we have five gap types: regulatory, technical, commercial, contextual, documentation)
- How the passport travels with verifiable provenance (we write `confidence_tier` and `confidence_reason` for every claim)

Atlas implements those four layers. D&D builds the political agreement that makes the output *trusted* across sectors.

---

**The offer**

I can show you one of three things next:

1. **Live demo matching** — I'll run Sarah's profile against the real corpus and show you the top 5 matches with honest scores.
2. **Gap analysis walkthrough** — I'll show you the structured delta between an evidence profile and a requirements profile, rendered in plain English.
3. **Schema deep-dive** — I'll walk you through the passport data model and show you where it maps to D&D's three-profile framing from the FAQ.

Which would be most useful?

---

*[Total spoken length: ~420 words — 2:45 at conversational pace. Leaves 15 seconds for the exec to choose.]*

