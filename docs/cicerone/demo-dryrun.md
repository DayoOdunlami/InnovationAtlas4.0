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

