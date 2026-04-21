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
| Floating mic on `/canvas` | In progress | UI button is present but not wired. Ships in Sprint A §3 — uses the existing Realtime backend. |

## This week's priorities

1. ~~**Thread 1** — status popover + AI context + legacy banners.~~ **Landed.**
2. ~~**Thread 2 / commit 1** — stage-mount for charts (`mountChartInStage`).~~ **Landed.**
3. ~~**Thread 2 / commit 2** — stage-mount for passport detail (`mountPassportInStage`).~~ **Landed.**
4. ~~**Thread 2 / commit 3** — stage-mount for interactive table (`mountTableInStage`).~~ **Landed.**
5. **Sprint A resumption** — pick up the floating-mic wire-up (Brief A §3 R6) next. The UI button exists; wire it to the existing Realtime backend and auto-expand the right rail on activate.
6. **Sprint C resumption** — pending; sequenced after Sprint A.
7. **Thread 3** — force-graph lens rebuild per `docs/force-graph-lens-plan.md`. No demo dependency; runs after Sprints A and C.

## Thread 2 boundary summary

| Commit | Hash | Lands |
| --- | --- | --- |
| 2/1 | `014be3c` | `mountChartInStage` tool + dispatcher + `CanvasStageChart` + `canvas.stage` slot on `CanvasState` + reducer extracted to `lib/canvas/apply-write-intent.ts` + top-bar "Return to force-graph" affordance. |
| 2/2 | `c7372e9` | `mountPassportInStage` tool + `CanvasStagePassport` (SWR, uses existing `PassportHeader` / `PassportDocuments` / `PassportClaimsSection`) + `GET /api/passport/[id]` thin read wrapper + `/canvas?passport=<id>` deep-link hydration. |
| 2/3 | `8b6af0d` | `mountTableInStage` tool + `CanvasStageTable` reusing `InteractiveTable` (search / sort / CSV + Excel export). |

Contracts held: every write tool still returns the `{ status, newState }` envelope per the Canvas State Contract (`docs/canvas-state-contract.md`); no existing canvas write tool changed shape; feature-status registry invariants still green.

Tests added: 17 unit tests on the reducer (`apply-write-intent.test.ts`, 19 total) + 14 on the tool schemas and execute envelopes (`stage-mount-tools.test.ts`, 20 total).

Follow-ups parked (not blocking the demo):
- Chart stage could grow a "open in chat rail" / "copy spec" affordance.
- Passport stage could cache SWR responses across re-mounts (today it revalidates once per mount).
- Table stage could respect a max-rows cap server-side so a runaway tool call can't dump 50k rows into the stage.

## How to update this doc

- Edit `src/lib/canvas/feature-status.ts` to flip a feature's status.
- Run `pnpm vitest run src/lib/canvas/feature-status.test.ts` to make sure the registry invariants still hold.
- Mirror the change in the relevant section above. Both must change together or the popover / AI / doc lie.
- If a WIP entry becomes Ready mid-sprint, also delete any `promptNote` that contradicted the new reality — a stale prompt note is how the assistant contradicts the UI.
