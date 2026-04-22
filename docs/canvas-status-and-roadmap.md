# Canvas status and roadmap

> Living, operational document. Update weekly (or whenever something flips
> status). Paired with `src/lib/canvas/feature-status.ts` — if a status
> changes in code, reflect it here and vice versa. The in-product
> `CanvasStatusPopover` and the LLM `buildCanvasContextSystemPrompt` both
> read from that TypeScript module, so the popover / AI / this doc can only
> disagree if someone forgets to update one of them.

For the force-graph rendering architecture, see
`docs/force-graph-lens-plan.md`. That is a separate, stable architectural
document — **do not conflate the two**.

## Legend

- **Ready** — demonstrable, behaves predictably, safe in a live stakeholder demo.
- **In progress** — shipping this sprint or next; may work partially but known to be rough.
- **Planned** — scoped and queued, nothing on disk yet.

## Canvas

| Feature | Status | Notes |
| --- | --- | --- |
| Three-column shell (`/canvas`) | Ready | Icon rail · main stage · chat rail. Top bar added Thread 1. |
| Status popover (this thing) | Ready | Hex/Linear chip; source of truth is `feature-status.ts`. |
| Force-graph lens | In progress | v1 demo-ready; gravity mode rebuild covered by Thread 3 (`docs/force-graph-lens-plan.md`). |
| Scatter lens | Planned | Stubbed disabled icon in the rail. |
| Sankey lens | Planned | Stubbed disabled icon in the rail. |
| Timeline lens | Planned | Stubbed disabled icon in the rail. |
| Coverage-matrix lens | Planned | Stubbed disabled icon in the rail. |
| Stage-mount: chart | Ready | Thread 2 / commit 1 landed. `mountChartInStage` (bar / line / pie) fills the main stage; return via the top-bar affordance. |
| Stage-mount: passport | Ready | Thread 2 / commit 2 landed. `mountPassportInStage` renders full passport (header / documents / claims) at canvas width; deep-link `/canvas?passport=<id>` also hydrates straight in. |
| Stage-mount: table | Ready | Thread 2 / commit 3 landed. `mountTableInStage` reuses `InteractiveTable` — search, sort, column visibility, CSV + Excel export. |
| Briefing panel | Planned | Briefing toolkit registered but empty; writable tools land Brief X Commit 12. |

## Landscape routes

| Route | Status | Notes |
| --- | --- | --- |
| `/landscape-3d` | In progress | Canonical 3D landscape. Force-graph works; gravity mode being rebuilt. |
| `/landscape` | In progress (legacy) | Exploratory variant — superseded by `/landscape-3d`. Shows a dismissible `LegacyBanner`. Post-demo decision to keep or delete. |
| `/landscape-v2` | In progress (legacy) | Same as above. Full-viewport canvas — banner rendered as absolute overlay. |

## Passport flow

All end-to-end live as chat-rail cards. No canvas stage-mount yet.

| Tool | Status |
| --- | --- |
| `listPassports` | Ready |
| `extractClaimsPreview` / `showClaimExtraction` | Ready |
| `saveClaimsToPassport` / `addEvidenceToPassport` / `rejectClaimByDescription` / `archivePassport` | Ready |
| `runMatching` / `showMatchList` | Ready |
| `showGapAnalysis` | Ready |
| `createDraftPitch` | Ready |
| `findConsortiumPartners` | Ready |

## Chat-rail visualisation cards

| Card | Status |
| --- | --- |
| Pie chart | Ready |
| Bar chart | Ready |
| Line chart | Ready |
| Interactive table | Ready |

## Voice

| Surface | Status | Notes |
| --- | --- | --- |
| Realtime voice (header / prompt mic) | Ready | Phases A–C shipped — see `docs/voice-realtime-phases.md`. |
| Floating mic on `/canvas` | Ready | Bottom-centre mic opens the same Realtime drawer as the header / prompt mic; JARVIS + MCP mentions carry over via `agentIdForVoiceFromThreadMentions`. Visual active state while a session is live. |

## This week's priorities

1. ~~**Thread 1** — status popover + AI context + legacy banners.~~ **Landed.**
2. ~~**Thread 2 / commit 1** — stage-mount for charts (`mountChartInStage`).~~ **Landed.**
3. ~~**Thread 2 / commit 2** — stage-mount for passport detail (`mountPassportInStage`).~~ **Landed.**
4. ~~**Thread 2 / commit 3** — stage-mount for interactive table (`mountTableInStage`).~~ **Landed.**
5. ~~**Sprint A / R6** — floating-mic wire-up on `/canvas` (Brief A §3 R6).~~ **Landed.**
6. **Sprint A remainder** — rest of Brief A still to resume.
7. **Sprint C resumption** — pending; sequenced after Sprint A.
8. **Thread 3** — force-graph lens rebuild per `docs/force-graph-lens-plan.md`. No demo dependency; runs after Sprints A and C.

## Thread 2 boundary summary

| Commit | Hash | Lands |
| --- | --- | --- |
| 2/1 | `014be3c` | `mountChartInStage` tool + dispatcher + `CanvasStageChart` + `canvas.stage` slot on `CanvasState` + reducer extracted to `lib/canvas/apply-write-intent.ts` + top-bar "Return to force-graph" affordance. |
| 2/2 | `c7372e9` | `mountPassportInStage` tool + `CanvasStagePassport` (SWR, uses existing `PassportHeader` / `PassportDocuments` / `PassportClaimsSection`) + `GET /api/passport/[id]` thin read wrapper + `/canvas?passport=<id>` deep-link hydration. |
| 2/3 | `8b6af0d` | `mountTableInStage` tool + `CanvasStageTable` reusing `InteractiveTable` (search / sort / CSV + Excel export). |

Contracts held: every write tool still returns the `{ status, newState }` envelope per the Canvas State Contract (`docs/canvas-state-contract.md`); no existing canvas write tool changed shape; feature-status registry invariants still green.

Tests added: 17 unit tests on the reducer (`apply-write-intent.test.ts`, 19 total) + 14 on the tool schemas and execute envelopes (`stage-mount-tools.test.ts`, 20 total).

Follow-ups parked (not blocking the demo):
- **[Priority — demo risk]** Table stage should respect a max-rows cap server-side so a runaway tool call can't dump 50k rows into the stage. A cap of ~500 with a trailing "+N more — refine your query" footer would be safe; today there is no guard.
- Chart stage could grow a "open in chat rail" / "copy spec" affordance.
- Passport stage could cache SWR responses across re-mounts (today it revalidates once per mount).

## Post-Thread-2 verification notes (questions to resolve post-demo)

### Q1. Does the model ever see `{ status: "dispatched" }`?

**Short answer: yes, on the tool-returning turn — then the overwritten `{ status: "applied", newState }` is what the model reads on every subsequent turn.** Not blocking the demo, but worth noting when interpreting first-turn assistant replies after a mount tool call.

Trace (from `node_modules/ai/dist/index.mjs`):

- **Line 9463** — inside `finishActiveResponse`, after the stream completes, the hook calls `this.sendAutomaticallyWhen({ messages: this.state.messages })` and, if true, calls `this.makeRequest(...)` immediately. At this point `this.state.messages` contains the tool output exactly as returned by the server's `execute` — which is `{ status: "dispatched", intent, at }`. This is the first auto-send.
- **Line 9282** — inside `addToolOutput` (what our `addToolResult({...})` call is aliased to), `sendAutomaticallyWhen` is re-checked **but only if** `this.status !== "streaming" && this.status !== "submitted"`. By the time `CanvasToolDispatcher`'s `useEffect` runs and calls `addToolResult`, `makeRequest` has already flipped the hook to `"submitted"` — so the guard fails and no second auto-send fires from the overwrite. The overwritten `{status: "applied", newState}` therefore lands in the message list but isn't sent as a delta; it rides along on the *next* user or auto-send turn.

What this means for demo behaviour:
- The model's immediate reply after `mountChartInStage` / `mountPassportInStage` / `mountTableInStage` (and the existing `focusOnProject` / `filterByQuery` / `resetCamera`) reads `{status: "dispatched"}` on that turn.
- On the next turn, it reads `{status: "applied", newState}` and `canvas.lastAction` — which is where the system prompt expects it to rely for state grounding anyway.
- This has been the working behaviour for the pre-existing canvas write tools all along (`focusOnProject` et al. have shipped on this same pattern) — the system prompt is tolerant.

Proposed fixes (not tonight):
1. Have the server `execute` `await` a brief client ack via a roundtrip before returning — heavy, probably wrong.
2. Add `sendAutomaticallyWhen` guard: return false until `lastAction.source === "agent"` matches the latest toolCallId. Cheap, contained to one file.
3. Accept the behaviour and add a single sentence to the system prompt: *"Tool results may arrive as `{status:"dispatched"}` on the turn they are called; read `canvas.lastAction` on subsequent turns for authoritative state."* Zero code change.

Recommendation: option 3 post-demo.

### Q2. `/api/passport/[id]` authorisation parity with `/passport/[id]`?

**Yes — identical auth path, no gap.** Both surfaces use `getSession()` and then `getPassportDetail(id)`; the only divergence is the failure mode (page `redirect("/sign-in")` + `notFound()`, route `401` + `404`). `getPassportDetail` queries `atlas.passports WHERE id = $1` with no user-scoped predicate, so both surfaces return the same rows for the same caller. Archived passports are visible on both (detail view does not filter `is_archived`, only the list does).

Stale-data window when a passport is edited in another tab and re-mounted on canvas:
- `CanvasStagePassport` uses `useSWR('/api/passport/${passportId}', fetcher, { revalidateOnFocus: false, errorRetryCount: 1 })`.
- SWR keys by URL, so **every mount of the same passport id hits the same cache entry**. A second mount in the same tab shows the previously fetched data immediately and does NOT revalidate (we disabled focus revalidation).
- No cross-tab invalidation: if the passport is edited in tab A, tab B's canvas mount keeps the stale copy until the component fully unmounts AND remounts AND the SWR key is evicted (which does not happen via stage transitions — we swap stages, we don't unmount the SWR hook's parent tree in a way that clears cache).
- In practice the stale window is "for the lifetime of the tab after the first mount" unless the user hard-refreshes, opens a new tab, or we add an explicit refetch trigger.

Proposed fixes (not tonight):
1. Pass `mutate` into a context and call it after any passport write tool (`saveClaimsToPassport` / `addEvidenceToPassport` / `rejectClaimByDescription`).
2. Set `dedupingInterval: 30_000` + `revalidateOnMount: true` so a re-mount after 30s refetches.
3. Bump the SWR key with the passport's `updated_at` when available from a list query already in state.

Recommendation: option 2 is the cheapest stale-window fix and ships in a one-line change when we revisit the passport SWR follow-up.

## How to update this doc

- Edit `src/lib/canvas/feature-status.ts` to flip a feature's status.
- Run `pnpm vitest run src/lib/canvas/feature-status.test.ts` to make sure the registry invariants still hold.
- Mirror the change in the relevant section above. Both must change together or the popover / AI / doc lie.
- If a WIP entry becomes Ready mid-sprint, also delete any `promptNote` that contradicted the new reality — a stale prompt note is how the assistant contradicts the UI.
