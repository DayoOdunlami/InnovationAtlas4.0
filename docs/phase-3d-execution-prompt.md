# Phase 3d — 3D Force Graph (POC-faithful) + brief storytelling blocks (execution prompt)

Self-contained instruction set for a cloud or local agent implementing **Phase 3d**: bring `docs/force-graph-lens-poc.html` (Three.js) into the app **near-verbatim**, wire **real landscape data**, complete **compare-mode rendering** (Query A + B, binary-star), and extend **landscape-embed** blocks for **narrative-driven** briefs (top-down default, light/print themes, focus-only card, AI-authored fly-through).

## Repo & branch

- Repo: `DayoOdunlami/InnovationAtlas4.0`
- Branch off: **`main`** (latest after PRs #12, #13, and #14)
- Create branch: `feat/phase-3d-3d-lens-brief-story`
- PR title: `feat(landscape): Phase 3d — 3D lens + brief storytelling (themes, focus-card, fly-through)`

## Migration slot reserved for you

If you need a new migration, use **`0022_atlas_landscape_embed_v2_phase3d.sql`**. Prefer **no migration** — schema v2 is JSON-only inside `blocks.content_json` and does not require DDL. Do **NOT** reuse slots `0019–0021` (used by Phase 3a, 3b, KB-1).

## Mission (ordered by dependency)

### 1. 3D native renderer (primary deliverable)

Create `src/components/landscape/force-graph-lens/force-graph-3d-native.tsx` that **ports the POC `<script>` block near-verbatim** (see "Verbatim port rules" below). This becomes the **default renderer** for:

- `/canvas` force-graph stage (via `CanvasStageRouter`)
- Owner-scope `landscape-embed` block editable mount

The existing `force-graph-2d.tsx` is **kept as automatic fallback** when WebGL is unavailable (feature-detect via `!!canvas.getContext('webgl2')` at lens mount). No feature flag; detection is implicit.

### 2. Compare mode rendering (functional gap)

`queryB` + `compareMode` state already exist in `src/components/landscape/force-graph-lens/index.tsx` but the 2D renderer **never implemented the binary-star layout**. The 3D renderer **must** implement:

- Binary-star layout math (POC `applyCompareLayout`): `xOnAxis = ((simB - simA) / (simA + simB)) * COMPARE_ANCHOR_X * 1.3`
- Node colour interpolation between query-A green (`#8fe4b1`) and query-B violet (`#b69afc`), weighted by `simA / (simA+simB)`, de-saturated to slate when `max(simA, simB) < 0.05`
- Two anchor spheres + connecting axis line
- Text sprites labelling `"QUERY A · {text}"` / `"QUERY B · {text}"`
- Footer legend rows `#legend-a` and `#legend-b` become visible

### 3. POC-faithful chrome

**Left column:**
- Layout mode buttons: Explore / Gravity / Compare (Gravity disabled until Query A set; Compare disabled until both set)
- Visual toggles: Edges, Ring guides, Cluster volumes, Spread overlaps (collide-only relaxation)
- Z-axis selector: Score / Time / Funding / Flat
- Camera presets: Fit all / Top-down / Reset / Fly-through
- Query presets (seed Query A)
- Collapsible "Advanced" section for debug toggles

**Right column:**
- Focused node detail card: type badge, title, funder, year, funding `£{n}k`, query A/B similarity %, score bar, 1-hop neighbours (**clickable** — re-focus the lens)
- Session log (timestamped user actions)

**Header (keep from existing lens):** Query A + Query B inputs, Share view, Ask JARVIS.

Do **not** reduce to the current "pill row only" — that was a Phase 3b simplification. Match POC chrome.

### 4. Theme variants

Support `theme: "dark" | "light" | "print"` via a **token map** consumed by both CSS (for chrome) and THREE materials (for scene). Concrete starter palette:

```ts
const THEME_TOKENS = {
  dark: {
    bg0: "#0a0e13", bg1: "#101620", bg2: "#1a2230",
    ink: "#e8ecf1", inkDim: "#8a96a8", rule: "#253040",
    grid: "rgba(143,228,177,0.04)",
    projectA: "#8fe4b1", queryB: "#b69afc", live: "#f5b547", warm: "#ff6b4a",
    edge: "rgba(74,85,102,0.6)",
  },
  light: {
    bg0: "#f7f8f9", bg1: "#ffffff", bg2: "#eef0f3",
    ink: "#1a2230", inkDim: "#4a5566", rule: "#d4d8de",
    grid: "rgba(34,97,63,0.06)",
    projectA: "#2d9163", queryB: "#6a4bcf", live: "#c38720", warm: "#cc4a2b",
    edge: "rgba(74,85,102,0.35)",
  },
  print: {
    bg0: "#ffffff", bg1: "#ffffff", bg2: "#fafafa",
    ink: "#000000", inkDim: "#333333", rule: "#bbbbbb",
    grid: "transparent",
    projectA: "#1f6b47", queryB: "#4a3099", live: "#8a5f10", warm: "#8a2f1a",
    edge: "rgba(0,0,0,0.3)",
  },
} as const;
```

Treat these as a **starting point** the agent may refine, but the three themes must be visually distinct and the light/print themes must remain legible on white paper.

### 5. Brief block schema v2 (concrete Zod)

Extend `LandscapeEmbedContent` in `src/lib/ai/tools/blocks/index.ts`. **Backward-compatible**: `schema_version: 1` keeps working; `schema_version: 2` adds fields.

```ts
export const LandscapeEmbedContentV2 = z.object({
  schema_version: z.literal(2),
  // layout / queries
  queryA: z.string().max(400).optional(),
  queryB: z.string().max(400).optional(),
  mode: z.enum(["gravity", "compare", "explore"]).default("gravity"),
  zAxis: z.enum(["score", "time", "funding", "flat"]).default("score"),
  // presentation
  display: z.enum(["graph", "focus-card", "graph-with-focus"]).default("graph"),
  focusedNodeId: z.string().max(64).optional(),
  cameraPreset: z.enum(["topdown", "fit", "explore"]).default("topdown"),
  theme: z.enum(["dark", "light", "print"]).default("light"),
  caption: z.string().max(500).optional(),
  // optional narrated tour
  flythrough: z.object({
    autoplay: z.boolean().default(false),
    loop: z.boolean().default(false),
    stops: z.array(z.object({
      kind: z.enum(["node", "cluster", "compare", "camera"]),
      nodeId: z.string().max(64).optional(),
      clusterId: z.number().int().nonnegative().optional(),
      query: z.string().max(400).optional(),
      queryB: z.string().max(400).optional(),
      caption: z.string().max(400),
      narration: z.string().max(1500).optional(),
      duration: z.number().int().min(500).max(20_000),
      transition: z.number().int().min(200).max(5_000).default(1_000),
    })).min(1).max(12),
  }).optional(),
}).refine((c) => c.mode !== "compare" || (c.queryA && c.queryB), {
  message: "compare mode requires queryA and queryB",
}).refine((c) => c.display !== "focus-card" || !!c.focusedNodeId, {
  message: "focus-card display requires focusedNodeId",
});

// Union wrapping legacy v1
export const LandscapeEmbedContent = z.union([
  LandscapeEmbedContentV1, // existing shape; keep as-is
  LandscapeEmbedContentV2,
]);
```

### 6. Focus-card block (server-renderable)

When `display: "focus-card"`, render a **rich RSC card** with no WebGL:
- Type badge (Project · {cluster_label} OR Live call · {cluster_label})
- Title (Fraunces italic)
- Funder · year · funding `£{n}k`
- Query A relevance % bar (only when `queryA` set)
- Score bar
- 1-hop neighbours (clickable in owner scope — opens lens modal focused on that id; plain `<a>` in share scope)

**Data resolution semantics:** the block stores only `focusedNodeId` + context (queries, caption). The renderer **re-resolves** node data from the same `/api/landscape/data` payload (or a lightweight `/api/landscape/node/{id}` if that exists) at render time. **Do NOT snapshot the full node blob into `content_json`** — it would stale on every data refresh. If the node no longer exists, show a graceful "Node no longer in landscape" state.

`graph-with-focus` stacks the focus card beside (or below on narrow viewports) the live graph.

### 7. Narrative flexibility

The AI may author **multiple** landscape-embed blocks in one brief with different `display` modes (e.g. intro `graph` → flagship `focus-card` → `compare` between two themes). Do not force a canonical layout.

### 8. AI-authored fly-through (medium effort, in scope)

Implement a **sequential runner** `useFlythrough(flythrough)` that:

1. If `autoplay: true` and block is in viewport, auto-starts after 1s grace period
2. For each stop:
   - Compute camera target (node position, cluster centroid, compare anchor midpoint, or explicit `{ target, theta, phi, distance }` for `kind: "camera"`)
   - Ease to target using POC's `tweenOrbit` (duration = stop's `transition`)
   - Hold for `duration` ms with caption overlay (lower-third, `position: absolute`, fade-in 300ms, fade-out 300ms, z-index 20)
   - If `narration` set, invoke TTS (see below)
3. UI: play / pause / skip-next / skip-prev buttons in the bottom-right; progress dots for each stop; on pause, user regains free camera control.
4. On last stop: if `loop`, restart; else show final caption + "Restart tour" button.

**TTS integration:** The `project-0-InnovationAtlas4.0-elevenlabs` MCP server is available in this workspace. Create a thin `/api/landscape/tts` route (or equivalent server action) that calls it; client queues `Audio` playback. **If the integration is non-trivial, ship without audio** — leave a clear TODO comment at the call site and the tour still runs silently with captions. Narration is a nice-to-have, not a blocker.

### 9. Share / RSC safety

- Owner routes: live 3D lens (WebGL) via `next/dynamic({ ssr: false })` island
- Share routes: **never** load Three.js. `display: "graph"` in share scope degrades to a **static SVG snapshot** (improve the existing Phase 3b snapshot if present; generate at save time or server-render from the data payload). `focus-card` and `graph-with-focus` (share scope = focus-card portion only) are already RSC-friendly.
- **Update `scripts/check-share-bundle.ts`** if you add any new client-only dep. Existing forbidden list already covers `three`, `react-force-graph-3d`, `d3-force` (lines 48–65). Append-only.

### 10. Data freshness line (small)

Under interactive + static embeds: `Landscape as of {snapshot_date} · {N} projects · {M} live calls`. Only render if the payload already exposes this metadata — **do not** add an extra API round-trip to compute it.

### 11. Tool description update (important for AI authoring quality)

In `src/lib/ai/tools/blocks/index.ts`, rewrite the `AppendLandscapeEmbed` description to steer model authoring. It must instruct the model to:

1. **Derive `queryA` from the brief's topic**, not leave it empty and emit a full-landscape snapshot. Example: brief about hydrogen rail → `queryA: "hydrogen fuel cell rail decarbonisation"`.
2. Default `mode: "gravity"` for topical sections; use `mode: "compare"` only when the paragraph explicitly compares two themes; use `mode: "explore"` only when the user asked for an overview.
3. Default `cameraPreset: "topdown"` and `theme: "light"` for brief-embedded graph blocks.
4. Prefer `display: "focus-card"` when the surrounding prose is about **one** project/entity; use `graph` for landscape context; use `graph-with-focus` when both matter.
5. Always include a `caption` explaining what the view reveals (1–2 sentences).
6. Consider `flythrough` only when the section names multiple specific projects/clusters that benefit from a guided tour.

### 12. Clickable neighbours (trivial, include)

Focus card + session-log entries with node references are clickable and re-focus the lens (owner) or link to `?focused={id}` (share).

### 13. Accessibility

- Compare mode: announce `"Comparing {A} vs {B} — {N} overlap, {M} A-only, {K} B-only"` via an `aria-live="polite"` region after each layout settles.
- Focus card: semantic HTML (`<article>`, `<dl>` for metadata).
- Fly-through: respect `prefers-reduced-motion` — shorten transitions to 0ms when set.
- Keyboard: `Tab` cycles chrome controls; `Space` toggles fly-through; `Escape` exits focused view.

## Verbatim port rules (POC → React)

**Goal:** Reuse the POC's Three.js code **as literally as possible**; only change **integration seams**.

1. **Imports** — `import * as THREE from "three"`, `import * as d3 from "d3-force"`. **No CDN scripts.** Both deps already in `package.json`.
2. **Data** — Replace `buildData()` / synthetic `CLUSTERS` with `adaptLandscapeData(real)` from `src/components/landscape/force-graph-lens/data-adapter.ts`. The POC node shape is a close match — write **one** mapping function, don't scatter adapter logic through the render loop.
3. **Cluster labels** — Consume labels the adapter provides (LLM-generated or heuristic per Phase 3b); the renderer only renders strings.
4. **React lifecycle** — `useRef<HTMLCanvasElement>()`; mount scene in `useEffect`; **dispose** THREE geometries/materials/textures on unmount; cancel `requestAnimationFrame`.
5. **Do NOT "modernise"** the orbit math, tween curves, similarity scoring, collide force, layout functions, or URL serialiser unless required for TypeScript. **Port first, refactor never in this PR.**
6. The POC `simulateJarvisResponse` is client-side template-based — **keep** the viewport capture + context packet primitive, but **route** the vision call through the real AI SDK chat route (same pattern Phase 3b established for `/api/jarvis` or equivalent).

## Required files to read before coding

- `docs/force-graph-lens-poc.html` — **the working HTML POC; functional + visual ground truth**
- `docs/force-graph-lens-plan.md` — architectural spec
- `src/components/landscape/force-graph-lens/index.tsx` — current lens shell, `queryB` / `compareMode` state
- `src/components/landscape/force-graph-lens/force-graph-2d.tsx` — Phase 3b 2D renderer; 3D should match feature parity (semantic zoom, cluster volumes, ring guides)
- `src/components/landscape/force-graph-lens/data-adapter.ts`, `types.ts`, `url-state.ts`, `hooks/use-gravity-search.ts`
- `src/components/brief/blocks/renderers/landscape-embed.{client,server}.tsx` (or equivalent) — existing block renderers
- `src/lib/ai/tools/blocks/index.ts` — `LandscapeEmbedContent`, `AppendLandscapeEmbed`, `dispatchBlockTool`
- `src/lib/ai/tools/blocks/briefing-tool-kit.ts` — `AppendLandscapeEmbed` is in `BRIEF_ID_TOOLS`
- `scripts/check-share-bundle.ts` — forbidden import list

## Scope fence (do NOT touch without escalation)

- `src/lib/db/pg/repositories/**` — frozen contracts
- Existing migrations `0000_*` through `0021_*`
- `src/proxy.ts`
- `src/app/(shared-brief)/**` layout changes unrelated to landscape-embed rendering (Phase 3c-a owns layout)
- `/api/landscape/gravity-search/route.ts` and `/api/landscape/data/route.ts` — healthy, leave alone (fix in place only if a bug blocks this phase)
- `src/components/passport/**`, `src/components/chat-plus/**`
- KB-1 tools (`src/lib/ai/tools/kb/**`)

## Backward compatibility

- Existing briefs with `schema_version: 1` landscape-embed blocks **must keep rendering**. Add a unit test with a v1 fixture that asserts the block still mounts and renders via the v2 renderer path (with defaulted v2 fields).
- On block save via `AppendLandscapeEmbed`, emit `schema_version: 2` going forward.
- Legacy `layout: "web" | "umap" | "rings"` maps to v2 `mode`:
  - `"web"` → `{ mode: "gravity" }`
  - `"umap"` → `{ mode: "explore" }`
  - `"rings"` → `{ mode: "gravity", cameraPreset: "fit" }` (rings is a visual variant of gravity)

## Tests & gates

Run locally before PR:

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build:local`
- `pnpm exec tsx scripts/check-share-bundle.ts`

**Required new/updated tests:**

- Unit: `LandscapeEmbedContent` v1 and v2 parsing; refinement errors for `compare` missing `queryB` and `focus-card` missing `focusedNodeId`.
- Unit: legacy-to-v2 mapping (`layout: "web"` → `mode: "gravity"` etc.) produces stable output.
- Unit: `AppendLandscapeEmbed` dispatcher accepts v1 and v2 inputs; telemetry event shape unchanged.
- Component: focus-card renders from a fixture node payload in jsdom without throwing.
- Component (best-effort): 3D lens mount + unmount does not throw in jsdom (may need `jest-webgl-canvas-mock` or an `__test__` mount helper that stubs WebGL context).
- E2E (Playwright, optional): owner authors a `focus-card` block via chat → share link renders it server-side without three.js in the bundle.

## PR description must include

- Screenshots: **dark canvas**, **light brief embed**, **print theme**, **compare-mode in 3D**, **focus-card**
- Verbatim port attestation — which POC sections ported with `< 10%` change, which required new wrapping
- Feature checklist (tick each): 3D mount · compare-mode visuals · top-down default · focus-card only · graph-with-focus · theme variants · fly-through runner · clickable neighbours · data-freshness line · accessibility (reduced motion + aria-live)
- Backward-compatibility statement: existing v1 briefs still render, with test proof
- Scope-fence attestation
- Test count delta
- Confirmation: **no migration used** (or migration slot `0022` justification)

## Out of scope (defer explicitly)

- Auto-generating `flythrough` from brief prose (future: summariser agent reads the paragraph and proposes stops)
- Full PDF export pipeline (this phase sets up the `print` theme; export mechanics are Phase 4)
- Cluster relabeling per brief context
- Query B auto-suggestion UI
- Mobile-specific behaviour beyond graceful stack
- Deleting `/landscape-3d` page (it keeps working with `variant="detail"` per Phase 3b)

---

## Handoff notes (for the human running the agent)

**LLM to use:** strong long-context coding model. **Claude Opus 4.5** (preferred for fidelity on the verbatim port) or **Claude Sonnet 4.5**. Cursor Cloud / GPT-5.1-codex class is acceptable. Avoid small/fast models — they tend to "simplify" the 3D port into another 2D pass.

**Fresh agent:** start a **new session** with this file as the only spec. Do not reuse the Phase 3b thread — it was correct for 3b but carries wrong defaults for 3d (2D primary, minimal chrome).

**Invocation:** "Implement `docs/phase-3d-execution-prompt.md` end-to-end. Branch from latest `main`. Open a PR and run every gate in the document."

---

**End of execution prompt**
