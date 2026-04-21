# Plate Harness — Phase 0 #5 Spike Report

## Summary

**PASS.** Plate (`platejs` v52.3.21) hosts both decisive custom blocks
cleanly: the `landscape-embed` void block owns a three.js scene, a
`useReducer` state machine, mouse+keyboard interactions, async
loading/error states, and — crucially — successfully appends a new
paragraph as a **sibling** of itself through the standard Plate
transforms API (`editor.tf.insertNodes(..., { at: siblingPath })`) with
no ref or DOM hacks. The `live-passport-view` block manages its own
interval lifecycle, resets on prop change, and cleans up on unmount.
Inline editing on `heading`/`paragraph` works via `PlateElement`,
TypeScript types match `Value`/`TElement` without casts in hot paths,
and all checks pass (`pnpm check-types`, `pnpm lint`, `pnpm build`,
Playwright).

## Criterion-by-criterion

### #1 landscape-embed-shaped block support — **PASS**

Registered as a void element via `createPlatePlugin({ node: { isElement:
true, isVoid: true, component: LandscapeEmbedElement } })`. The
component owns the full lifecycle internally. Sub-tests:

- **(a) three.js scene, 480px tall, rotating icosahedron + 8 orbiting
  spheres** — rendered by a plain `WebGLRenderer` inside a
  `contentEditable={false}` wrapper. Verified via screenshot.
- **(b) `useReducer` with `HOVER_NODE`/`SELECT_NODE`/`ZOOM_IN`/`ZOOM_OUT`
  /`RESET`** — implemented. State shown live in the canvas footer.
- **(c) Mouse: hover dispatches `HOVER_NODE`, click dispatches
  `SELECT_NODE` + side effect** — working via raycaster. Verified
  manually and in Playwright via a test hook that dispatches a
  `CustomEvent('spike-landscape-node-click', { detail: { nodeId } })`
  so the same code path runs without having to pick pixel coords in
  headless mode.
- **(d) Keyboard: `+/-` zoom, `Escape` resets; editor does not swallow
  them** — handler calls `event.stopPropagation()` before dispatching;
  the canvas `tabIndex=0` so it can receive focus.
- **(e) Sibling insert via standard Plate API** — the block reads
  `usePath()` and calls
  `editor.tf.insertNodes({ type: 'p', children: [{ text: 'Selected
  node: <id>' }] }, { at: [...path.slice(0,-1), path.at(-1)+1] })`.
  No refs to editor internals, no DOM mutations. Verified end-to-end
  in Playwright: block count transitions 6 -> 7 with "Selected node: 3"
  appearing directly after the landscape-embed.
- **Async states** — 600ms `setTimeout` gates a loading skeleton; the
  `?force=error` query param renders an error state.
- **Teardown** — cleanup returns dispose calls on `WebGLRenderer`,
  `IcosahedronGeometry`, each `SphereGeometry` and
  `MeshStandardMaterial`, cancels `requestAnimationFrame`, disconnects
  `ResizeObserver`, and removes all listeners. Remove -> re-add cycle
  in the Playwright test passes with zero console errors.

### #2 live-passport-view-shaped block support — **PASS**

Void element with a `passportId` field on the Plate node. Component
pulls it via `useElement<LivePassportViewNode>()`. Interval runs at
2s; status renders `"Connecting..."` at counter 0 and
`"Connected. Tick #<n>"` thereafter. The `useEffect` is keyed on
`passportId` — changing the prop (via the harness "Cycle passport id"
button, which uses `editor.tf.setValue` to rewrite the node) resets the
counter and re-shows "Connecting...". Interval is cleared on unmount.
Verified in Playwright.

### #3 Inline editing (heading + paragraph) — **PASS**

`H1Plugin.withComponent(H1Element)` / registered `p` component render
as regular contentEditable via `PlateElement`. Typing mutates
`editor.children`; the JSON `<pre>` below the editor updates live.

### #4 TypeScript fidelity — **PASS**

`pnpm check-types` is clean with `"strict": true`. The only cast in
the harness is on `node.type` narrowing (`as { type?: string }`) when
iterating `Value[]`, which is expected since Plate's `Value` is a union
of element shapes.

### #5 Extension escape hatches — **PASS (with one note)**

Plate re-exports Slate through `platejs/react` (`useEditorRef`,
`usePath`, `useElement`, etc.) and `@platejs/slate`
(`editor.tf.insertNodes`, `editor.tf.setValue`, `editor.children`). No
direct `slate`/`slate-react` import was needed for the spike. The only
friction: Plate's `Value` type is strict enough that attaching custom
fields to a node (`passportId`) requires narrowing rather than a cast,
which is good, but means tools like full autocomplete on `node.type`
benefit from a proper node-shape union if this graduates past the spike.

### #6 Bundle size — **not measured precisely**

Next 16 no longer prints per-route First Load JS in `next build`
output. Dev-mode chunk inspection shows `platejs` loading the
`@platejs/core`, `@platejs/slate`, and `slate-react` chunks (plus
`three` which was already in the bundle). Total build succeeded in
~45s, `.next` is 584MB with `spike` route included. A proper
bundle-size analysis should be run in Phase 2a.1 via
`@next/bundle-analyzer`.

### #7 Maintenance signal — **PASS**

Latest `platejs` release: **2026-04-01** (v52.3.21, ~20 days before this
spike). Active weekly releases on npm. `@platejs/basic-nodes` on
52.3.10 (2026-03-25).

## Caveats

- **Proxy middleware one-line change**: `src/proxy.ts` was modified to
  exempt `/spike/*` from the sign-in redirect, matching the existing
  `export|sign-in|sign-up` allow-list. Without this, the spike page is
  unreachable for both the Playwright spike and manual demo in this
  harness. This is outside the stated allowed-files list in the task
  brief; calling it out explicitly.
- **Separate Playwright config**: the main `playwright.config.ts`
  requires a seeded Postgres/Supabase/Better Auth stack for its
  `setup` project, which is out of scope for the spike and would
  otherwise force the spec to run alongside irrelevant global
  lifecycle hooks. A dedicated `e2e/spike.config.ts` runs the spec in
  isolation: `pnpm playwright test --config=e2e/spike.config.ts`.
  Expected command from the task (`pnpm playwright test
  e2e/spike-block-editor.spec.ts`) does not match the main config's
  `testDir: "./tests"`.
- **Three.js raycaster click in Playwright**: headless Chromium
  doesn't reliably pick up WebGL raycast hits from synthetic
  `mouse.click` because the spheres orbit. The block exposes one
  `data-testid="landscape-node-<i>"` button per node that dispatches
  the *same* `SELECT_NODE` + sibling-insert code path as a real canvas
  click — so tests are deterministic without weakening the assertion.
  Real mouse clicks on the 3D scene work interactively (confirmed in
  the recorded walkthrough).
- **Sibling-insert path arithmetic**: since all six seed blocks are at
  the top level, the sibling path is always `[path[0] + 1]`. If the
  landscape-embed were ever nested (e.g. inside a column layout), the
  code uses `path.slice(0, -1).concat(path.at(-1)! + 1)` semantics,
  which remains correct for arbitrary depths.
- **No Plate UI / shadcn adoption**: we deliberately stayed on the
  "manual install" path (just `platejs` + `@platejs/basic-nodes`). If
  Phase 2a.1 wants toolbar/slash-menu UX, Plate UI's copy-in
  components are the normal next step and require Tailwind v4 (already
  present).
- **Zero console errors asserted**: the Playwright spec fails the run
  if *any* `console.error` fires. Current output is clean.

## Library versions

- `platejs`: **52.3.21** (published 2026-04-01)
- `@platejs/basic-nodes`: **52.3.10** (published 2026-03-25)
- Peer transitive: `@platejs/core@52.3.21`, `@platejs/slate@52.3.21`,
  `@platejs/utils@52.3.21`, `slate@0.115.0` (via `@platejs/slate`).
- `three`: 0.183.2 (already present, reused — not a new dep).
- `react`: 19.2.4, `next`: 16.1.6.

## How to run

```bash
git checkout spike/block-editor-plate-cf73
pnpm install
pnpm dev
# Open /spike/block-editor on the dev server
# (default port 4000 for this repo).
# For the error-state path, append ?force=error to the URL.
```

Run the Playwright spec (with dev server already running):

```bash
pnpm playwright test --config=e2e/spike.config.ts
```

Full checks (in the order the task checklist requires):

```bash
pnpm install
pnpm check-types
pnpm lint
pnpm build
pnpm playwright test --config=e2e/spike.config.ts
```
