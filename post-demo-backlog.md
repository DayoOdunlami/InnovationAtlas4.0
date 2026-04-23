# Post-Demo Backlog

Receipt trail of debts knowingly accepted during the three-week demo stabilise window instated by the Brief-First Rebuild v1.2 scope change (2026-04-21).

Each entry documents what it is, why it was not fixed pre-demo, and which Brief-First phase will address it (or "won't fix — superseded" with reason).

Append as items are noticed during stabilise. Do not close entries in this file — closure happens in the referenced Brief-First phase or in an explicit follow-up PR.

- **Created:** 2026-04-21
- **Plan of record:** Brief-First Rebuild v1.2 — https://www.notion.so/349c9b382a748164b28cf72de76ee59f
- **Demo branch:** `feat/canvas-unified`

---

## Entry shape

```
### <one-line title>
- **What:** one or two sentences describing the defect or debt.
- **Why not pre-demo:** scope rule / avoided in demo script / architectural supersede coming / unaffordable risk under freeze.
- **Rebuild phase:** Brief-First phase reference (e.g. "Phase 2a.1") or "won't fix — superseded" with reason.
- **Noticed:** date and surface (commit hash, file path, audit note, conversation reference).
```

---

## Seeded entries (from the scope-change decisions)

### /landscape-3d gravity / keyword-orbiting mode broken
- **What:** In `/landscape-3d`, invoking keyword/gravity search does not spatially arrange nodes around the keyword. Queries either return "no matches above threshold" or collapse nodes into visual overlap. Root cause is a mix of threshold tuning, layout-finalisation timing, and React-root unmount ordering; prior fixes were repeatedly lost to untracked-file churn.
- **Why not pre-demo:** Scope rule — demo script explicitly avoids gravity mode. `feature-status.ts` marks `route.landscape-3d.gravity` as `wip` so the agent redirects any user who asks.
- **Rebuild phase:** Phase 3b — landscape-embed block absorbing Force Graph v2. Ground-up rebuild per `docs/force-graph-lens-plan.md`, with `docs/force-graph-lens-poc.html` as the gold-standard interaction + visual reference (explore · gravity · compare · semantic zoom · URL state · viewport-JARVIS). Defect is superseded, not patched.
- **Noticed:** 2026-04-19 onwards; captured in `docs/force-graph-lens-plan.md`, `docs/force-graph-lens-poc.html`, and the `docs/canvas-status-and-roadmap.md` status board.

### Stage-mount tool — transient `{ status: "dispatched" }` result seen by the model
- **What:** The three stage-mount tools (`mountChartInStage`, `mountPassportInStage`, `mountTableInStage`) return `{ status: "dispatched" }` from their server `execute`, which the client overwrites to `{ status: "applied", newState }` in `onToolCall`. `useChat`'s `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` fires immediately on the assistant turn containing the tool result, so the model can see the pre-overwrite `{ status: "dispatched" }` value on the follow-up request for that one turn.
- **Why not pre-demo:** Freeze per decision 9. The model's prompt tolerates the transient value (it doesn't loop or hallucinate a retry), and the demo script does not depend on the applied-state payload being visible mid-turn.
- **Rebuild phase:** Phase 2a.1 / §4 tool-contract redesign. Block-level CRUD tools replace stage-mount; this specific semantic disappears. Parked as "won't fix — superseded" once Phase 2a.1 lands.
- **Noticed:** Post-Thread-2 verification Q1. Commit `6ba36b9 refactor(canvas): extract applyWriteIntent helper + tests` on `feat/canvas-unified`.

### CanvasStagePassport SWR cross-tab stale window
- **What:** `CanvasStagePassport` fetches `/api/passport/[id]` via `useSWR` with `revalidateOnFocus: false`. A passport edited in one tab is not reflected in a `/canvas` tab already showing it until a manual remount or hard refresh.
- **Why not pre-demo:** Freeze per decision 10. Demo script does not cross-edit passports across tabs during the session.
- **Rebuild phase:** Phase 3a — `live-passport-view` block subscribes to Supabase Realtime for the passport's claim/match stream. Static SWR fetch is superseded; close as "won't fix — superseded" once 3a lands.
- **Noticed:** Post-Thread-2 verification Q2. `src/components/canvas/stage/canvas-stage-passport.tsx`.

### /canvas ephemeral threadId on every page load
- **What:** `/canvas` generates a new `threadId` client-side each mount. Refresh or hard reload discards chat history and any `active_passport_id` binding on the thread row. No URL-owned thread segment today.
- **Why not pre-demo:** Accepted per decision 13. Demo script explicitly does not refresh the canvas tab during the live demo.
- **Rebuild phase:** Phase 1 — `/brief/[id]` becomes the canonical URL-owned intent surface. `/canvas` route deprecates in Phase 4 behind a redirect. Superseded at Phase 1.
- **Noticed:** Audit pass 2026-04-15; `src/components/canvas/canvas-workbench.tsx` and `src/app/(chat)/canvas/page.tsx`.

### /chat-plus remains live as a frozen demo fallback
- **What:** `/chat-plus` and its `<ChatPlusLayout/>` tree continue to exist unchanged. A "Try split view" pill is still rendered in the app header today; the decision is to hide the pill (one-line commit, ships after demo-script approval) but keep the route alive as a fallback during the demo window.
- **Why not pre-demo:** Duplicate-don't-extract trade codified in the convergence discussion. Deprecation is a Phase 4 redirect, not a pre-demo action.
- **Rebuild phase:** Phase 4 — 301 redirect `/chat-plus/[thread]` → `/brief/[id]` (or closest equivalent). Full deletion of `src/components/chat-plus/**` and `src/app/(chat)/chat-plus/**` in Phase 4 cutover.
- **Noticed:** Audit 2026-04-15; header pill decision 2026-04-21 (decision 11).

### CanvasStageTable has no visible row cap
- **What:** `CanvasStageTable` renders every row returned by the underlying query with no client-side cap. A malformed agent tool call or large result set could render tens of thousands of rows and stall the browser mid-demo.
- **Why not pre-demo:** Decision 12 — 100-row visible cap with "showing 100 of N" indicator ships this week, gated on demo-script approval. Tracked here as a receipt for the chosen cap value and indicator text.
- **Rebuild phase:** Block-type table cap is re-scoped in Phase 2b (static block types). The 100-row cap likely rises or becomes paginated at that point.
- **Noticed:** Audit 2026-04-15; `src/components/canvas/stage/canvas-stage-table.tsx`.

### Orphan briefing slice on feat/canvas-unified (commit 7c3b209)
- **What:** An unused `BriefingState` slice sits in `src/app/store/index.ts` with no UI consuming it. Added in anticipation of Sprint C; Sprint C is now frozen and superseded by the Brief-First rebuild.
- **Why not pre-demo:** Inert, no runtime cost. Removing it is a refactor that risks regressions for no demo benefit.
- **Rebuild phase:** Phase 2a.0 / Phase 2b — replaced by the real block-level brief state machine. Delete as part of Phase 2a.0 landing or the Phase 4 cutover, whichever lands first.
- **Noticed:** Audit 2026-04-15; commit `7c3b209` on `feat/canvas-unified`.
- **Status:** DONE — removed in Phase 2a.0. Slice definitions, `initialBriefingState`, `state.briefing`, and the sessionStorage mirror block all deleted from `src/app/store/index.ts`. The real block state now lives in `atlas.blocks` behind `pgBlockRepository`.

### Deleted branch `feat/canvas-sprint-c` (historical)
- **What:** Single commit `5d680d2 feat(store): add briefing slice (Sprint C R1)` carried an earlier version of the orphan briefing slice. Branch deleted locally 2026-04-21 per decision 2. Commit is now unreachable unless referenced by hash.
- **Why not pre-demo:** Dead code; superseded by the slice already on `feat/canvas-unified`.
- **Rebuild phase:** Won't fix — superseded by Phase 2a.0.
- **Noticed:** 2026-04-21 freeze triage.

### Deleted branch `feat/canvas-sprint-a` (historical)
- **What:** Local pointer at `4c978b0`; no work beyond what landed on `feat/canvas-unified`. Deleted 2026-04-21 per decision 3.
- **Why not pre-demo:** No content to carry forward.
- **Rebuild phase:** n/a.
- **Noticed:** 2026-04-21 freeze triage.

---

## Noticed during stabilise

_Populated as items emerge during the three-week stabilise window. Keep entries concise; link to commits, files, or conversation IDs where useful._

<!-- append new entries below this line -->

---

## Proposed post-demo features

_Captured ideas for features considered during the freeze but deferred to a named Brief-First phase. These are not debts — they are architectural captures made while the design thinking was fresh. Each entry points to a design doc; no code is written until the referenced phase._

### KB-1 — Curated Knowledge Base (implementation plan for #16 `kb-document` source type)
- **What:** An admin-curated library of policy docs / white papers / government reports / strategy papers (CP7/CP8, DfT decarbonisation plan, ORR annual reports, Network Rail strategic plans, CAA airspace modernisation, etc.), chunked and embedded, tagged by the enumerated transport modes + strategic themes + `atlas.lens_categories`, exposed to JARVIS and ATLAS via a read-only `surfaceKnowledgeBase` tool (matches `searchKB` already named in #16 §7, renamed for `surfaceResearch` naming-convention alignment). **This is the concrete storage + retrieval + taxonomy + bias plan for the `kb-document` citation source type already named in #16 §5.2.** No seventh source type; no change to the frozen six-type union. Extends the proven `hive` schema + HYVE prompt-tier pattern to the rest of the Atlas domain without touching HIVE.
- **Why capture now:** (1) **Resolves #16 Open Question #1** — *"Curated KB documents: what's the list?"* The shape of the answer is now fixed (~15-30 docs, enumerated modes/themes, admin-approval workflow); the exact document list still needs Dan / Domas / mode-lead approval but is no longer blocking. (2) **#7a Outcome Evals (Tier-1 contract-fidelity)** — brief-contract `evidence-threshold` scoring is systematically low on thematic-question briefs until this lands; measuring before Phase 2b produces false-negatives. (3) **Phase 1 Caching Spike — one Phase 1 ask** — add a retrieval-heavy variant to the caching protocol so the four-currency budget assumptions are verified for KB-heavy archetypes. 15-minute addition.
- **Why not pre-demo / not Phase 1:** New data domain, not a bug fix. Pollutes the Phase 1 scope fence (brief / block / message schema + repository layer + telemetry + access control). No block-type change, so not a Phase 2a.0 dependency.
- **Rebuild phase:** **Phase 2b** (moved forward from the previous Phase 3a placement in #16 §13 Q1) — after Phase 2a.0 agents write blocks and before Outcome Evals need meaningful evidence-threshold scoring. Orthogonal to Phase 3 (live-passport-view / landscape-embed).
- **Design doc:** [`docs/knowledge-base-plan.md`](./docs/knowledge-base-plan.md) — schema options (`atlas.knowledge_documents` + `atlas.knowledge_chunks` preferred over `library.*` or extending `hive.*`), bias governance (over-grounding / under-grounding / drift), taxonomy discipline (enumerated modes + themes, no free-form tags), coupling notes to #16 / #7a / #8 / Composition Prompt Budget / Phase 1 caching spike, three strategic decisions owed before build, seed-content sizing (~15 v1, ~30 target).
- **Notion proposal page:** [Proposed Feature — Curated Knowledge Base (implementation plan for kb-document source type)](https://www.notion.so/34ac9b382a748121ac02d0108db9722d) — workspace-level summary linked from the Brief-First plan and cross-referenced from #16 §5.2 + §13 Q1.
- **Precedent in repo:** `hive` schema + `src/lib/ai/prompts/hyve.ts` evidence-tier discipline + existing embed scripts (`scripts/embed_live_calls.py`, `scripts/embed_organisations.py`, `scripts/embed_lens_categories.py`) + storage bucket pattern (`scripts/setup-atlas-storage.ts`). ~70% of the plumbing already exists.
- **Noticed:** 2026-04-21. Phase 0 closeout / Phase 1 brief v1.1 ratification. Two external AI evaluations (Cursor naming HIVE as the precedent, Claude naming failure modes and phase placement) + my coupling analysis to existing specs. Initial framing as *"seventh source type"* corrected to *"implementation plan for existing `kb-document` type"* after re-reading #16 §5.2 + §7 + §13 Q1.

### BUG-1 — canvas stage reducer has no `clearStage` / `returnToForceGraph` action (Phase 2a-blocking)
- **What:** `applyWriteIntent` handles `mountChartInStage`, `mountPassportInStage`, and `mountTableInStage` but has no inverse action. The "Return to force-graph" affordance (top-bar button and force-graph lens chip) is user-driven via `handleReturnToForceGraph` in `src/components/canvas/canvas-workbench.tsx`, which calls `appStore.setStage` directly and bypasses the reducer. Net effect: one of the most common canvas state transitions is invisible to the reducer's `lastAction`, making it unobservable by tests, telemetry, undo/redo, URL-state serialisation, or future `content_json`-persisting blocks.
- **Why not pre-demo:** Freeze per decision 1 (no forward changes on `feat/canvas-unified`). Demo flow works — the UI button still clears the stage; only the reducer path is incomplete. Three `it.skip` tests in `src/lib/canvas/canvas-stage-dispatcher.test.ts` carry `[BUG-1]` labels pending the fix.
- **Rebuild phase:** **Phase 2a.0 blocker** — brief-first blocks rely on reducer-driven state to populate `content_json` and observe canvas transitions. Ship the fix at or before Phase 2a.0 kickoff: (1) add `DefaultToolName.ClearStage`, (2) add a `clearStage` handler in `applyWriteIntent` that resets `stage` to `{ kind: "force-graph" }` and writes `lastAction = { type: "clearStage", source: "user" }`, (3) route `handleReturnToForceGraph` through the dispatcher, (4) un-skip the three `[BUG-1]` tests. ~30–50 lines; ~20 minutes of work.
- **Noticed:** 2026-04-21. PR `test(canvas): behavioural coverage for stage-mount dispatcher #2` on `test/canvas-stage-coverage` off `feat/canvas-unified`. Commit `23b0a15`. Discovered by the stage-mount test Cloud Agent.

### /api/brief-blocks POST — authoring role after Phase 2a.1
- **What:** `src/app/(brief)/api/brief-blocks/route.ts` was introduced in Phase 2a.0 as the only write path for `atlas.blocks`. Owner UI was read-only in 2a.0, so the endpoint served tests + future authoring.
- **Why not pre-demo:** N/A — item is a procedural follow-up, not a defect. Phase 2a.0 landed with this endpoint as the only authoring surface.
- **Rebuild phase:** **Phase 2a.1 — RESOLVED.** User + agent writes now flow through server actions in `src/app/(shared-brief)/brief/[id]/actions.ts` (and the agent tool dispatcher in `src/lib/ai/tools/blocks/index.ts`). The `/api/brief-blocks` POST endpoint stays as-is, narrowly scoped to test-seeding (matches its original header comment). No migration required; Playwright specs continue to seed blocks via the endpoint.
- **Noticed:** Phase 2a.1 brief §4.4.
