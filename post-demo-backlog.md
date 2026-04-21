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
