# Force-graph lens — rebuild plan

> Status: **frozen during demo window (2026-04-21 → 2026-05-12).** No code will be
> written against this plan until Brief-First Rebuild Phase 3b. The plan remains
> directionally accurate for the Phase 3b `landscape-embed` block.
>
> **Gold-standard reference:** [`docs/force-graph-lens-poc.html`](./force-graph-lens-poc.html) —
> self-contained POC demonstrating explore / gravity / **compare (binary-star)** modes,
> UMAP-pinned 3D with configurable Y-axis depth, **semantic-zoom cluster labels**,
> full **URL-owned state** round-trip, and **viewport-aware JARVIS** (screenshot +
> context packet → vision model). Interaction + visual spec for Phase 3b overrides
> the sections below where they disagree. Two known extensions the POC adds on top
> of the plan sections: compare mode and viewport-JARVIS; both are captured in the
> Brief-First plan §3 (block interaction patterns).
>
> **Original status (retained for history):** plan only, no code written yet. This
> document superseded the stashed gravity-mode patch that was lost twice. Owner:
> review and approve (or push back) before any commits.

---

## 1. Honest current state (2026-04-20)

- **`/landscape-3d`** is a standalone page (~1,226 lines, `src/app/(chat)/landscape-3d/page.tsx`) that embeds `react-force-graph-3d`, its own sidebar of filter controls, a gravity-mode panel, and a lot of imperative d3-force plumbing.
- **`/canvas`** (`src/components/canvas/canvas-workbench.tsx`) is a three-panel shell — icon rail + main stage + chat rail — whose force-graph lens today **dynamically imports the entire `/landscape-3d` page** as a placeholder. The workbench header comment explicitly flags this as a temporary arrangement (“Commit 9 will extract a shared `<ForceGraphLens/>`”). The sprint already anticipated this rebuild.
- **Gravity mode** as shipped produces “two rings / two circles” and nothing more. Prior attempts to patch it (rank-based rings, `finaliseLayout` helper, preset pills, deferred unmount, auto-fit effect, separate `gravity-layout.ts` module with unit tests) have evaporated twice — the untracked files were never committed and have now disappeared from disk and from stash/reflog. **Zero live gravity-mode fixes exist in this repo today.**
- **`/api/landscape/gravity-search`** (`src/app/api/landscape/gravity-search/route.ts`) is healthy: it embeds the query with `text-embedding-3-small` and calls `atlas.gravity_similarity_search`. The threshold is already permissive — any non-empty result set passes.
- **Canvas state contract** (`src/app/store/index.ts` → `CanvasState` + `CanvasLastAction`) and **canvas write tools** (`src/lib/ai/tools/canvas/{read,write}-tools.ts`) are in place. Every mutation flows `schema → server intent → client dispatcher → zustand → lens re-renders`. Agent-driven and user-driven mutations are distinguished via `lastAction.source`.

**Conclusion:** the data and state layers are solid. The rendering / UX layer is what needs to be rebuilt — and should have been rebuilt as Commit 9 anyway.

---

## 2. Goal

Replace the current `/landscape-3d`-embedded-in-`/canvas` arrangement with a **canvas-native `<ForceGraphLens/>` component** that:

1. Takes its instructions exclusively from `appStore.canvas` (filter, selection, hover, cameraTarget, `lastAction`).
2. Has **no sidebar, no control chrome** — those are owned by the workbench or driven by chat tool calls.
3. Makes **gravity mode a first-class layout**, not a bolt-on toggle, with three well-defined layouts (web / UMAP / rings) chosen via `canvas.filter.query + canvas.activeLens` or via a small in-lens switcher.
4. Is **fast to load, cheap to unmount** (no three.js on the canvas path unless explicitly requested).
5. Leaves `/landscape-3d` intact as an optional “deep-dive” 3D page for power users — it will consume the same lens with a `variant="detail"` prop. We do not delete it in this sprint.

---

## 3. Proposed architecture

```
src/components/landscape/
  force-graph-lens/
    index.tsx                  — public entry: <ForceGraphLens variant="canvas" | "detail" />
    force-graph-2d.tsx         — canvas-native renderer (d3-force + HTML5 canvas)
    force-graph-3d.tsx         — existing react-force-graph-3d renderer (detail variant only)
    layouts/
      umap.ts                  — pin each node at (x, y) from snapshot
      web.ts                   — physics layout anchored at query, distance ∝ 1/similarity
      rings.ts                 — rank-based concentric rings, top-120 by similarity
      query-anchor.ts          — builds the synthetic query node + links
      finalise.ts              — filter links to ids present in final node set
      index.ts                 — buildLayout(mode, nodes, similarity) → {nodes, links}
    hooks/
      use-gravity-search.ts    — POST /api/landscape/gravity-search, caches by query
      use-canvas-sync.ts       — subscribes to appStore.canvas, returns filter + selection
    preset-queries.ts          — six demo pills (hydrogen, autonomy, rail decarb, UAS, smart cities, active travel)

  landscape-graph-dev-settings.ts   — (existing, keep)
  canvas.ts                          — (existing, keep)

src/lib/landscape/
  gravity-layout.test.ts       — pure-function tests for layouts/*
  snapshot.ts                  — (existing, unchanged)
  types.ts                     — (existing; extend with QueryNode, LayoutMode)
```

Key properties:

- **Pure layout functions** in `layouts/*.ts`. They take `(baseNodes, similarityMap, options)` and return `{nodes, links}`. No DOM, no refs, no react — trivially unit-testable.
- **Rendering split by variant.**
  - `variant="canvas"` → `force-graph-2d.tsx`. Two-dimensional. HTML5 canvas via `d3-force` + our own render loop. Cold paint <300 ms. Can unmount instantly. Honest trade-off: no 3D eye-candy on canvas.
  - `variant="detail"` → `force-graph-3d.tsx`. Wraps `react-force-graph-3d`. Same layout math; same state hooks. Used by `/landscape-3d` only.
- **One state subscription**. `useCanvasSync()` is the only hook that reads `appStore.canvas`. Both renderers call it. No duplicate zustand subscriptions.
- **One API call path**. `useGravitySearch(query)` debounces and caches by query string; a repeat of the same query does not re-fetch.

---

## 4. 2D-vs-3D decision

**Default the canvas lens to 2D.** Reasons:

- `react-force-graph-3d` pulls three.js (~600 KB gzipped) and takes ~2–3 s to paint. That is disproportionate for an artifact embedded in a chat UI where users may open and close the lens many times per session.
- 2D renders are easier to label legibly (text-as-DOM over canvas, no billboard tricks) and trivially respect the colour tokens in the rest of the UI.
- Gravity mode is a 2D concept. The existing `z` calculation in the “rings” layout (`(0.5 - q) * 260 + (n.type === "live_call" ? 14 : 0)`) is eye-candy, not signal.
- Users who want 3D already have `/landscape-3d`.

If after shipping a user asks for 3D-in-canvas, the `variant` prop makes it a 5-minute flip.

---

## 5. Gravity mode — design

Three layouts, selectable by a small pill-group in the top-left of the lens (canvas variant) or via a chat tool call (`setGravityLayout(mode)`):

| Layout | Pinning | Use when |
| --- | --- | --- |
| **Web** | query anchor pinned at origin; top-80 nodes free; distance controlled by `linkDistance ∝ 1 / similarity`, `linkStrength ∝ similarity`; rest of landscape pinned at UMAP and dimmed | user wants to *feel* similarity as physical distance |
| **UMAP** | all nodes pinned at their snapshot `(x, y)`; top-80 coloured, rest dimmed; query anchor pinned at similarity-weighted centroid of top-80 | user wants to see *where in the map* relevance lives |
| **Rings** | top-120 nodes distributed across three concentric rings by rank (not by absolute similarity); query anchor at origin; rest pinned at UMAP and dimmed | demo / “orbit” aesthetic |

Shared rules:
- **The top-K selection is rank-based, never threshold-based.** If the best similarity is 0.31, that node still goes in the inner ring. The old code’s “similarity >= 0.45” cutoff is what produced empty scenes.
- **Every link must reference a node in the final node set.** A `finaliseLayout(nodes, extraLinks)` helper filters both structural and synthetic query links through the final id-set. (This is the single most impactful fix from the lost patch — d3-force crashes with `node not found` otherwise.)
- **Query anchor is small**. `val: 6`, not 18. Sparse result sets make a large anchor look like a bug.
- **The camera always fits to the scene** after a layout change, via a `useEffect` on `[layout, query, graphData]` that schedules `fit(800, 180)` — 1800 ms delay for web (sim needs to settle), 400 ms for UMAP and Rings (fully pinned).

**Preset pills** (demo affordance, six of them): `hydrogen fuel cell vehicles`, `autonomous vehicles and connected mobility`, `rail decarbonisation and traction energy`, `unmanned aerial systems and drone corridors`, `smart cities digital twins urban mobility`, `active travel cycling walking infrastructure`. Each has produced a well-populated result set in prior manual tests.

---

## 6. Sequencing (small, reviewable commits)

Each commit is stand-alone, has tests, and lands on `feat/force-graph-lens` branched off `feat/canvas-unified`.

1. **`feat(landscape): pure layout library`** — `src/components/landscape/force-graph-lens/layouts/**` + `gravity-layout.test.ts`. No UI. Just the math. User visibility: none. Verification: `pnpm vitest run src/lib/landscape/gravity-layout.test.ts` — ≥6 tests, all pass.

2. **`feat(landscape): useGravitySearch + useCanvasSync hooks`** — the two hooks, no renderer yet. Unit-testable with a fake fetch. User visibility: none.

3. **`feat(landscape): ForceGraphLens 2D canvas variant`** — `force-graph-2d.tsx` + `index.tsx`. Static layout only (no gravity yet). Rendered into a tiny `/dev/force-graph-lens` playground route so we can preview without touching canvas or landscape-3d. User visibility: new playground route only.

4. **`feat(canvas): swap workbench force-graph lens to new component`** — `canvas-workbench.tsx` stops dynamic-importing `/landscape-3d` and renders `<ForceGraphLens variant="canvas" />` instead. User visibility: `/canvas` now loads in ~300 ms, no sidebar chrome, but no gravity mode yet.

5. **`feat(landscape): gravity mode in ForceGraphLens`** — wires layouts + `useGravitySearch` + preset pills. User visibility: gravity mode actually works on `/canvas`. **Stop here and have you verify visually before continuing.**

6. **`feat(landscape-3d): adopt ForceGraphLens variant=detail`** — `/landscape-3d/page.tsx` becomes a thin shell that renders `<ForceGraphLens variant="detail" />`. Removes ~800 lines from that file. User visibility: `/landscape-3d` still works but is simpler; gravity mode now consistent across both surfaces.

7. **`feat(canvas): chat-driven gravity — `setGravityQuery` + `setGravityLayout` tools`** — adds two canvas write tools so the LLM can say “show me the innovation around rail decarb” and the lens reacts. User visibility: voice and chat can drive gravity mode. **Demo-ready.**

Total scope: ~1,400 net LOC added, ~900 LOC deleted, 7 commits, ≥15 new unit tests.

---

## 7. Test strategy

- **Unit tests (`vitest`)** for every `layouts/*.ts` function. Pure in, pure out. Cover: empty similarity map, single-node match, all-nodes-match, tie-breaking, `finaliseLayout` drops orphan links.
- **Component tests (`vitest` + React Testing Library)** for `ForceGraphLens`. Renders with mocked canvas filter. Verifies the expected node count, that the query anchor is present with `id === QUERY_NODE_ID`, that the `lastAction.source === "user"` on pill-click.
- **Playwright smoke (`tests/`)** for `/canvas`: load the page, click a preset pill, assert the scene has ≥20 visible nodes and no console errors. A single test keeps regressions honest.
- **Manual verification** from the user (you) after commit 5, then again after commit 7. Specific scenarios listed in §9.

---

## 8. Risks and mitigations

- **Files keep vanishing.** Twice now, the gravity-mode work has disappeared between sessions. Root cause is that the work sat as untracked files through a `lint-staged` or editor-revert cycle. **Mitigation: every commit lands as a real git commit with no intermediate “work lives only on disk” steps.** If a commit introduces a file, it goes in the same commit as the code that imports it. `git status` should be clean or have staged-for-the-same-commit changes only.
- **`d3-force` in 2D needs a different integration pattern from `react-force-graph-3d`.** The 2D canvas renderer is hand-rolled. Ship the playground route (commit 3) before touching `/canvas` so regressions are contained.
- **Removing sidebar controls may upset muscle memory on `/landscape-3d`.** `/landscape-3d` is *not* losing its sidebar — commit 6 keeps it as today, only the rendering loop moves to the shared lens. The canvas variant is the one with no sidebar.
- **Embedding cost.** Every preset click hits `text-embedding-3-small`. Cache results in `useGravitySearch` keyed by `query.trim().toLowerCase()`; presets never re-embed within a session.
- **Scope creep.** Do not attempt to also tackle scatter / sankey / timeline lenses in this branch. Those are Commit 10+ per the existing sprint plan.

---

## 9. Manual verification checklist (you run these)

After commit 5 (`gravity mode in ForceGraphLens`):

- [ ] Hard refresh `/canvas`. Lens appears within 1 s, no sidebar.
- [ ] Click **Rail decarb** pill → scene reflows; a blue anchor node sits in the middle; roughly 80 coloured nodes arranged around it; the rest of the landscape is visible as a dim grey backdrop.
- [ ] Flip to UMAP → nodes snap to their real UMAP positions, top-80 keep colour, rest dimmed, anchor at the weighted centroid.
- [ ] Flip to Rings → top-120 distributed across three concentric rings, anchor at origin, no visible clumping.
- [ ] No console errors. No `node not found`. No `Attempted to synchronously unmount a root` warning.
- [ ] Paste a gibberish query (“asdfghjkl”) → lens shows a toast or inline “no matches” state; does NOT crash or clear the underlying map.

After commit 7 (`chat-driven gravity`):

- [ ] In `/canvas`, say to the agent: *“Show me innovation around rail decarbonisation.”* → the lens reflows to the Web layout with `rail decarbonisation` as the query. The chat confirms the action.
- [ ] Say: *“Switch to the UMAP view.”* → layout flips. No double-fetch of the embedding (the same query is reused).
- [ ] Verify `appStore.canvas.lastAction.source === "agent"` via devtools.

---

## 10. Open questions (please answer before I start coding)

1. **Is 2D-in-canvas acceptable?** I strongly recommend it. Say no and I’ll keep the canvas variant on `react-force-graph-3d` — adds ~2 s paint time per open.
2. **Do you want the preset pills visible in canvas?** They’re great for demos but consume screen real-estate. Alternative: presets live behind a small `⚡` button.
3. **Is `feat/force-graph-lens` off `feat/canvas-unified` the right branching strategy?** Or do you want a direct PR into `main` once merged into `feat/canvas-unified`?
4. **How much of `/landscape-3d` chrome (filters, search, top-k slider) do you still want?** My default: keep it all on `/landscape-3d`, strip everything from the canvas variant except the three-layout switcher and the preset pills.
5. **Any gravity-mode preset queries I should add or remove?** The six listed in §5 are the ones that produced good demos previously.

---

## 11. What I am **not** doing without further approval

- Committing unplanned changes to `page.tsx` or `canvas-workbench.tsx`.
- Adding new runtime dependencies (no `sigma.js`, no `d3-force-3d`, no `@react-three/*`). The plan uses only libraries already in the tree.
- Touching the briefing slice, passport tooling, voice stack, or any non-canvas surface.
- Rewriting the gravity-search API or the snapshot loader — both work.
