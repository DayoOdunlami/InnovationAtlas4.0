# Task: Phase 3b — landscape-embed block + Force Graph v2 rebuild

## Repo & branch

- Repo: `DayoOdunlami/InnovationAtlas4.0`
- Branch off: `main` (currently at tag `phase-2b-close`, sha `a13d1a9`)
- Create branch: `feat/phase-3b-landscape-embed`
- Open a PR when done with title: `feat(blocks): Phase 3b — landscape-embed block (Force Graph v2)`

## Migration slot reserved for you

If you need a new migration, use **`0020_atlas_landscape_embed_phase3b.sql`**. Do **NOT** use 0019 or 0021 — those are reserved for sibling parallel work (Phase 3a and KB-1).

## Mission (two parts)

This is the largest phase. **Read both referenced docs in full before starting.**

### Part A — Rebuild the force-graph lens

Rebuild as a canvas-native component per `docs/force-graph-lens-plan.md` §3 architecture:

- New `src/components/landscape/force-graph-lens/` directory with `index.tsx`, `force-graph-2d.tsx`, `force-graph-3d.tsx`, `layouts/{umap,web,rings,query-anchor,finalise,index}.ts`.
- Three layouts must work: `web` (physics, query-anchored), `umap` (pinned x/y from snapshot), `rings` (rank-based concentric, top 120 by similarity).
- Existing `/api/landscape/gravity-search` endpoint is healthy — **do not touch it**.

**The POC at `docs/force-graph-lens-poc.html` is your functional + visual target.** All three modes (explore / gravity / compare), the binary-star layout math, semantic-zoom thresholds (`CLUSTER_LABEL_FADE_*`, `NODE_LABEL_FADE_START`), the cluster volume translucency (0.04 opacity), the ring guides, the footer legend, the JARVIS modal screenshot pattern, the Fraunces + JetBrains Mono typography, the colour tokens (`--query-a`, `--query-b`, `--warm`, `--bg-0..2`), and the URL-owned state round-trip — all of it transfers verbatim into React components.

**Do NOT ship synthetic data.** Replace the POC's `buildData()` generator with a fetcher:

- Node/link payload → `/api/landscape/data` (already exists, returns real projects).
- Query similarity → `/api/landscape/gravity-search` (already exists, real pgvector).
- Cluster labels → HDBSCAN/k-means on UMAP-pinned coords → one LLM call per cluster for the display label, cached keyed on the snapshot hash. In the POC these are hard-coded; in production they're LLM-generated once per snapshot and re-used.

Where the plan doc and the POC disagree, **the POC wins** (it is the functional ground truth).

### Part B — Wrap the lens as a `landscape-embed` block

- Block type already in the CHECK constraint (`src/lib/db/pg/schema.pg.ts:557`). **No block-type migration.**
- `content_json` shape: `{ query?: string, layout: "web" | "umap" | "rings", lens?: string, schema_version: 1 }`.
- New read-only RSC renderer for share scope — renders a **static snapshot thumbnail**, not the live force graph (share route must not ship three.js).
- New "use client" editable mount for owner scope that renders the full interactive lens.
- Agent tool `AppendLandscapeEmbed({ query, layout, lens })` — follow the pattern in `src/lib/ai/tools/blocks/index.ts` and add to `briefing-tool-kit.ts` `BRIEF_ID_TOOLS` set.

## Required context files to read

- `docs/force-graph-lens-plan.md` — **read in full (~195 lines)**. This is your architectural spec.
- `docs/force-graph-lens-poc.html` — **open the file, it is a working POC**. Your UX + behaviour target. Every interaction mode, layout math, semantic-zoom threshold, colour token, and the JARVIS modal pattern is encoded here. Transfer verbatim into React components.
- `post-demo-backlog.md` — "`/landscape-3d` gravity / keyword-orbiting mode broken" entry.
- `src/app/(chat)/landscape-3d/page.tsx` — **1,226 lines**. The existing page. You will **NOT** delete it; you will give it a `variant="detail"` prop that consumes your new lens, per plan §2.5.
- `src/components/canvas/canvas-workbench.tsx` — current force-graph embedding approach. You will cut over this file to the new lens.
- `src/app/store/index.ts` — `CanvasState` + `CanvasLastAction`. Your lens **reads from** this store; do **not** duplicate state.
- `src/lib/ai/tools/canvas/{read,write}-tools.ts` — existing canvas tool pattern.
- `src/components/brief/blocks/renderers/*.server.tsx` — RSC renderer pattern for share route.
- `src/lib/ai/tools/blocks/briefing-tool-kit.ts` — add your new tool name to `BRIEF_ID_TOOLS`.

## Design constraints

1. **Canvas state contract is frozen.** Your lens consumes `appStore.canvas` (filter, selection, hover, cameraTarget, `lastAction`) — it does not own state. Per plan §3.
2. **No sidebar, no control chrome inside the lens.** Filter + layout switcher are owned by the workbench or driven by chat tool calls. Per plan §2.2. (The POC has a control sidebar because it's a standalone demo; your React version pushes those controls **out** to the workbench.)
3. **Share route must not load three.js.** RSC snapshot image on share; live lens only on owner route. Update `scripts/check-share-bundle.ts` forbidden list with `three`, `react-force-graph-3d`, and `d3-force` (append-only). Use `next/dynamic({ ssr: false })` island.
4. **URL-owned state:** the lens must round-trip its filter/selection/mode through URL search params per POC and plan §4. The POC has a complete implementation in `serialiseState()` / `readUrlOnBoot()` — copy the pattern.
5. **JARVIS viewport-vision pattern:** the POC's `captureViewport()` (`preserveDrawingBuffer: true` + `canvas.toDataURL()`) + context packet is the correct architecture. Keep the primitive; the actual vision-model call routes through your AI SDK chat route (not a mock).
6. **Scope fence — do NOT touch:**
   - `src/lib/db/pg/repositories/**` (frozen contracts).
   - Existing migrations (`0000_*` through `0018_*`).
   - `src/proxy.ts`, `src/app/(brief)/**`, `src/components/passport/**`, `src/components/chat-plus/**`.
   - `/api/landscape/gravity-search/route.ts` (it is healthy; leave alone).
   - `/api/landscape/data/route.ts` (it returns what you need; leave alone).

## Tests required

- **Unit:** each layout function in `layouts/` has deterministic output for a small fixture (3–5 nodes).
- **Unit:** agent tool dispatcher — `AppendLandscapeEmbed` with valid/invalid input.
- **Component test:** the lens renders without crashing given a canvas store snapshot.
- **Bundle check:** `scripts/check-share-bundle.ts` passes with new forbidden entries.
- **E2E (Playwright, optional):** owner appends a landscape-embed via chat → block appears → refresh → persists. Skip if flaky.

## Gates

Run locally before PR:

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build:local`
- `pnpm exec tsx scripts/check-share-bundle.ts`

## PR description must include

- Architectural mapping: plan §3 components → actual files created.
- POC feature coverage checklist (explore / gravity / compare / semantic-zoom labels / ring guides / JARVIS modal / URL round-trip / z-axis switcher) — tick each one.
- Scope-fence attestation.
- Screenshots of the three layouts (web, umap, rings) working in canvas + in a brief block.
- Test count delta.
- Note confirming migration slot `0020` used (or "no migration needed").

## Out of scope

- Deleting `/landscape-3d` page (it becomes the `variant="detail"` consumer — per plan §2.5).
- Fixing every quirk in the POC (your job is to hit spec, not exceed it).
- The vision-model call itself beyond wiring it through the existing AI SDK chat route (the POC simulates it client-side; your implementation must route it through the real backend).
