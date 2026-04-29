# Phase 7 — Retrieval Strategy Decision Scorecard

Purpose: score the Phase 6 harness outputs systematically and produce a defensible production default.

Time: ~2 to 2.5 hours total.

Output: 1-2 page production retrieval defaults spec.

---

## How to use

1. Open all 14 screenshots in `reports/phase6-screenshots/`.
2. For each query Q1-Q7, score all 5 strategies at cap=2 and cap=None.
3. Fill one block per query+cap (14 blocks).
4. Aggregate totals and apply tie-break rules.
5. Write the production default spec at the end.

---

## Hard sanity gate (pass/fail, not scored)

For each query+cap, mark:

- Strategy 3 `rawCandidates > 0`: Yes / No
- Inferred modes non-empty: Yes / No
- Query button label matches canonical seed query text: Yes / No

If any "No", note it in `Issues` and treat scores as diagnostic only until fixed.

Pre-check from current Phase 6 screenshot/report set:
- No sanity gate failures detected across all 14 rounds.
- Strategy 3 rawCandidates > 0 for all rounds (Q1-Q6: 20, Q7: 3).
- Inferred modes are non-empty for all rounds.
- Query labels match canonical seed query text in order.

---

## Scoring rubric (0-2 per axis)

Each strategy gets 4 axis scores:

- Relevance to intent
- Coverage/completeness
- Noise/hallucination risk
- CPC usefulness/actionability

Max per strategy per query+cap: 8.

### Axis 1 — Relevance to intent
- 0: tangential / wrong
- 1: mixed / partial
- 2: directly answers intent

### Axis 2 — Coverage/completeness
- 0: monoculture / narrow / missing key context
- 1: some breadth but uneven
- 2: good complementary spread

### Axis 3 — Noise/hallucination risk
- 0: noisy fragments (ToC/glossary/page artifacts) likely to mislead
- 1: mostly clean with some risk
- 2: clean grounding and low overgeneralization risk

### Axis 4 — CPC usefulness/actionability
- 0: generic or misframed for CPC decisions
- 1: usable with manual editing
- 2: directly usable for CPC stakeholder conversation

Note for Axis 3: in notes, explicitly record both:
- Chunk cleanliness
- Grounding faithfulness risk

---

## Per-query scorecards (pre-populated headers + inference)

## Q1 cap=2 — "How should we think about portable assurance for funding evidence?"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: industry, assurance_trust  
Fallback: yes — generic_innovation  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q2 cap=2 — "What's happening in maritime decarbonisation funding?"

Inferred modes: maritime  
Inferred themes: decarbonisation, industry  
Fallback: no — none  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q3 cap=2 — "How do we make innovation evidence travel between projects?"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: (none)  
Fallback: yes — generic_innovation  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q4 cap=2 — "What does the strategic business plan say about decarbonisation?"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: decarbonisation  
Fallback: yes — cross_cutting_phrase  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q5 cap=2 — "Frame our Atlas funding intelligence work in terms of Justin's architectural pattern"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: industry  
Fallback: yes — cross_cutting_phrase  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q6 cap=2 — "What rail innovation funding closes in Q1?"

Inferred modes: rail  
Inferred themes: industry  
Fallback: no — none  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q7 cap=2 — "Connect the testbed model to current transport innovation programmes"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: testbeds_innovation  
Fallback: yes — cross_cutting_phrase  

Sanity gate:
- S3 rawCandidates > 0: Yes (3)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q1 cap=None — "How should we think about portable assurance for funding evidence?"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: industry, assurance_trust  
Fallback: yes — generic_innovation  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q2 cap=None — "What's happening in maritime decarbonisation funding?"

Inferred modes: maritime  
Inferred themes: decarbonisation, industry  
Fallback: no — none  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q3 cap=None — "How do we make innovation evidence travel between projects?"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: (none)  
Fallback: yes — generic_innovation  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q4 cap=None — "What does the strategic business plan say about decarbonisation?"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: decarbonisation  
Fallback: yes — cross_cutting_phrase  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q5 cap=None — "Frame our Atlas funding intelligence work in terms of Justin's architectural pattern"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: industry  
Fallback: yes — cross_cutting_phrase  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q6 cap=None — "What rail innovation funding closes in Q1?"

Inferred modes: rail  
Inferred themes: industry  
Fallback: no — none  

Sanity gate:
- S3 rawCandidates > 0: Yes (20)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Q7 cap=None — "Connect the testbed model to current transport innovation programmes"

Inferred modes: rail, aviation, maritime, hit  
Inferred themes: testbeds_innovation  
Fallback: yes — cross_cutting_phrase  

Sanity gate:
- S3 rawCandidates > 0: Yes (3)  
- inferred modes non-empty: Yes  
- query label correct: Yes  

| Strategy | Relevance | Coverage | Noise | CPC use | Total | Notes |
|---|---:|---:|---:|---:|---:|---|
| 1 Strict Mode | /2 | /2 | /2 | /2 | /8 | |
| 2 Bridged (Mode + D&D) | /2 | /2 | /2 | /2 | /8 | |
| 3 Pure Semantic | /2 | /2 | /2 | /2 | /8 | |
| 4 D&D Only | /2 | /2 | /2 | /2 | /8 | |
| 5 Mode + Theme | /2 | /2 | /2 | /2 | /8 | |

Winner this query+cap:  
Why (1-2 sentences):  
Business confidence ("Would I show this to Thomas/Christian/Domas without caveat?"): Yes / No  
Issues:

---

## Aggregate section

### Total scores

| Strategy | cap=2 total (/56) | cap=None total (/56) | Combined (/112) |
|---|---:|---:|---:|
| 1 Strict Mode | Provisional: mid | Provisional: mid | Provisional: mid |
| 2 Bridged | Provisional: high | Provisional: high | Provisional: high |
| 3 Pure Semantic | Provisional: mid-high | Provisional: mid-high | Provisional: mid-high |
| 4 D&D Only | Provisional: high on D&D, low on transport-specific | Provisional: high on D&D, low on transport-specific | Provisional: situational high |
| 5 Mode + Theme | Provisional: high on mode-specific | Provisional: high on mode-specific, more repetition risk | Provisional: high but query-sensitive |

### Win count by query class

| Query class | Queries | Most wins |
|---|---|---|
| D&D-native | Q1, Q5, Q7 | Mostly S2/S4 split |
| Transport mode-specific | Q2, Q6 | Mostly S5 |
| Cross-cutting transport | Q4 | S1/S5 edge |
| Cross-pollination / ambiguous | Q3 | S2/S4 edge |

### cap=2 vs cap=None

- cap=2 clearly better? Yes (provisional default for production robustness)
- cap=2 hid critical chunks? Which queries: None obvious in this run; verify manually on Q1/Q5/Q7 for nuance loss.
- cap=None caused monoculture? Which queries: Repetition pressure seen most on Q1/Q3/Q5 (and partially Q6).

Decision rule:
- If cap settings are within +/-2 points overall, prefer cap=2 for robustness unless it hides critical chunks.

---

## Tie-break rules

If two strategies tie on combined score:
1. Fewer Relevance=0 results wins
2. Then fewer Noise=0 results
3. Then better cross-pollination performance (Q3, Q5, Q7)
4. If still tied, prefer simpler operational default (usually Strategy 2 over dynamic split)

---

## Production defaults spec (provisional, AI-scored)

### Decision
- ATLAS default: Strategy 2 (Bridged) + cap=2
- JARVIS default: Strategy 5 (Mode + Theme) + cap=2

### Why
1. Strategy 2 is the best all-terrain option across D&D doctrine plus transport policy, making it safer for ATLAS cross-pollination prompts.
2. Strategy 5 is strongest on tightly scoped operational/mode asks (for example maritime and rail funding queries), which fits likely JARVIS usage.
3. cap=2 reduces duplicate-document dominance and keeps response composition more diverse without obvious critical loss in this test pack.

### Known limitations
- This scoring is a best-effort proxy for CPC stakeholder usefulness, not a substitute for your direct Thomas/Christian/Domas judgement.
- Q4 "strategic business plan" may still over-index government strategy docs versus RSSB intent unless prompt framing is tightened.
- D&D-only retrieval remains highly valuable for Justin/Testbed/Passport asks but should not be the global default.

### Deferred items (Phase 8+)
- Hybrid retrieval (BM25 + semantic)
- Cross-encoder reranking
- Inference fallback refinements
- Query-intent classifier
- Per-query strategy routing

### Verification plan
- Keep `/admin/kb-retrieval-test` as regression harness
- Re-run seed query pack after default change
- Re-run KB-first routing smoke scripts
- Stakeholder check (required): review 3 sampled outputs per agent with CPC lens and confirm "without caveat" threshold.
- If stakeholder check fails for either agent, re-open strategy split and compare S2 vs S5 with the same cap=2.

### Confidence
- Confidence level (1-5): 3.5
- What would change this decision: stakeholder review indicates S5 underperforms on cross-pollination (ATLAS) or S2 underperforms on focused deadline/funding asks (JARVIS).

### Human verification note (please confirm)
- Please explicitly verify the "Business confidence" judgement with your CPC stakeholder context before finalizing defaults.
- Treat this as a provisional recommendation until you confirm at least one representative output each for Thomas, Christian, and Domas-style questions.

