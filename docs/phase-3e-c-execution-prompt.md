# Task: Phase 3e-c — New block kinds for briefs (chart, table, callout, image, divider)

## Repo & branch

- Repo: `DayoOdunlami/InnovationAtlas4.0`
- Branch off: `main` (after Phase 3e-b has merged — you need the `size` / `span` columns)
- Create branch: `feat/phase-3e-c-block-kinds`
- Open a PR when done with title: `feat(brief): Phase 3e-c — chart/table/callout/image/divider blocks`

## Migration slot reserved for you

Use **`0023_atlas_blocks_new_types_phase3ec.sql`**. Do NOT use 0022 (Phase 3e-b) or 0024+ (reserved for sibling parallel work 3e-d).

## Mission

Close the formatting gap between the current brief surface and a "PowerPoint / Word quality" exportable report by adding five new block kinds:

| Block type | `content_json` shape | Default `size` | AI author? | User author? |
|---|---|---|---|---|
| `chart` | `{ variant: 'bar' \| 'pie' \| 'line', title, description?, xAxisLabel?, yAxisLabel?, data: [...], schema_version: 1 }` | `md` | yes | no (edits via 3e-e) |
| `table` | `{ caption?, columns: [{key, header}], rows: [{[key]: string}], schema_version: 1 }` | `lg` | yes | no (edits via 3e-e) |
| `callout` | `{ tone: 'info' \| 'warn' \| 'success' \| 'quote', title?, body, schema_version: 1 }` | `md` | yes | yes (toolbar action) |
| `image` | `{ blobKey, blobUrl, alt, caption?, credit?, schema_version: 1 }` | `lg` | **no** (user-uploaded only) | yes |
| `divider` | `{ variant: 'line' \| 'space', schema_version: 1 }` | `full` | yes | yes (toolbar action) |

## Deliverables

### 1. Schema migration

Update the `blocks_type_chk` CHECK constraint in [src/lib/db/pg/schema.pg.ts](src/lib/db/pg/schema.pg.ts) and emit a migration that widens the allowed types to the union above. The existing constraint already lists `chart` and `table` — you only need to add `callout`, `image`, `divider` and REAFFIRM the existing ones. Drop and re-add the CHECK constraint in the migration (Postgres cannot ALTER a CHECK in place).

### 2. Zod schemas + AI tools

In [src/lib/ai/tools/blocks/index.ts](src/lib/ai/tools/blocks/index.ts):

- Add `AppendChartInput`, `AppendTableInput`, `AppendCalloutInput`, `AppendDividerInput` Zod schemas. Mirror the existing append-verb conventions (`briefId: z.string().uuid()`, optional `afterBlockId`, optional `size`, optional `span`).
- **Do NOT add `AppendImageInput`** — image uploads are user-driven. The AI can only reference an already-uploaded image via `UpdateBlock` if the block is `type='image'`.
- Extend `dispatchBlockTool` with new cases for each new tool name. Each case:
  - Parses the input.
  - Calls `pgBlockRepository.create({ type, contentJson, source: 'agent', size, ...position })`.
  - Calls `revalidateBriefPage(briefId)` (the helper already exists from 3e-a).
- Extend `BLOCK_TOOL_SCHEMAS` with the new tool descriptors and their `description` strings.
- Add the new tool names to `DefaultToolName` in [src/lib/ai/tools/index.ts](src/lib/ai/tools/index.ts): `AppendChart`, `AppendTable`, `AppendCallout`, `AppendDivider`.
- Add the new names to `BRIEF_ID_TOOLS` in [src/lib/ai/tools/blocks/briefing-tool-kit.ts](src/lib/ai/tools/blocks/briefing-tool-kit.ts) so their `briefId` is injected server-side.

### 3. Chart renderer (reuses recharts@2.15.4)

Create `src/components/brief/blocks/renderers/chart.server.tsx` (or client if recharts needs the DOM — prefer a `"use client"` island + thin RSC wrapper).

- Reuse the data-shape conventions from [src/lib/ai/tools/visualization/create-bar-chart.ts](src/lib/ai/tools/visualization/create-bar-chart.ts) and `create-pie-chart.ts` so the AI can re-use the same argument patterns.
- Render `variant='bar'` with `BarChart` + `Bar` per series; `variant='pie'` with `PieChart` + `Pie`; `variant='line'` with `LineChart` + `Line`.
- Honour `size` from the wrapper: fix canvas height to `240px` for `sm`, `320px` for `md`, `420px` for `lg`, `520px` for `full`. Width is always `100%` of the grid cell.
- Title + description render **above** the chart with brief-theme typography tokens.

### 4. Table renderer

Create `src/components/brief/blocks/renderers/table.server.tsx`. Pure HTML `<table>` with sticky header, zebra rows, monospace numeric alignment. Respect brief theme tokens. Caption renders below the table as a `<caption>` / `<figcaption>`.

### 5. Callout renderer

Create `src/components/brief/blocks/renderers/callout.server.tsx`. Boxed component with left border coloured by tone:

- `info` — `--primary` (blue)
- `warn` — amber
- `success` — `--brand-green`
- `quote` — muted foreground + serif

Optional `title` as `<strong>`; `body` supports the same inline marks as the `paragraph` block (bold / italic / code / link — reuse the existing mark renderer if possible).

### 6. Image block renderer + upload flow

Create `src/components/brief/blocks/renderers/image.server.tsx` that renders `<img src={blobUrl} alt={alt}>` with `caption` as `<figcaption>` and optional `credit` as smaller muted text.

**Upload flow** (owner scope only):

- Add `src/app/api/brief/[briefId]/image/route.ts` that wraps [src/lib/file-storage/vercel-blob-storage.ts](src/lib/file-storage/vercel-blob-storage.ts). Re-use the same storage interface — do not copy-paste.
- Enforce `AccessScope` at the route: the authenticated user MUST own the brief (`pgBriefRepository.getById(briefId, scope)`), reject with 403 otherwise.
- Accept `multipart/form-data` with a single `file` field; max 8 MB; MIME must start with `image/`.
- On success, call `pgBlockRepository.create({ briefId, type: 'image', contentJson: { blobKey, blobUrl, alt: '', schema_version: 1 }, source: 'user' })` and return `{ blockId }`.
- Add a small "Add image" button to the editable block list toolbar ([src/components/brief/blocks/editable/editable-block-list.client.tsx](src/components/brief/blocks/editable/editable-block-list.client.tsx)) that opens a file picker and POSTs to the new route.

### 7. Divider renderer

Create `src/components/brief/blocks/renderers/divider.server.tsx`. `variant='line'` renders `<hr>` with themed border; `variant='space'` renders a padded empty div for visual rhythm.

### 8. BlockList dispatch

In [src/components/brief/blocks/block-list.server.tsx](src/components/brief/blocks/block-list.server.tsx), extend the `dispatch` switch to route each new type to its renderer. No `placeholder` fallback for the new types.

### 9. Telemetry

Add new `ActionEventName` entries in the telemetry envelope:

- `brief_block_chart_rendered`
- `brief_block_table_rendered`
- `brief_block_callout_rendered`
- `brief_block_image_uploaded`
- `brief_block_divider_rendered`

Emit them from the renderers (RSC-safe — use the existing server-side emit helper). The briefing tool kit's `brief_block_tool_call` / `brief_block_tool_rejected` envelopes already cover the AI-authored side; do not duplicate.

## Required context files to read

- [AGENTS.md](AGENTS.md).
- [docs/phase-3e-b-execution-prompt.md](docs/phase-3e-b-execution-prompt.md) — so you know what `size` / `span` mean when you plumb them through.
- [src/lib/ai/tools/blocks/index.ts](src/lib/ai/tools/blocks/index.ts) — the existing append verbs are your pattern.
- [src/lib/ai/tools/blocks/briefing-tool-kit.ts](src/lib/ai/tools/blocks/briefing-tool-kit.ts) — you will add the new tool names to `BRIEF_ID_TOOLS`.
- [src/lib/ai/tools/visualization/create-bar-chart.ts](src/lib/ai/tools/visualization/create-bar-chart.ts) and `create-pie-chart.ts` — data-shape parity.
- [src/components/brief/blocks/block-list.server.tsx](src/components/brief/blocks/block-list.server.tsx).
- [src/components/brief/blocks/renderers/paragraph.server.tsx](src/components/brief/blocks/renderers/paragraph.server.tsx) — the inline-marks renderer to share with `callout`.
- [src/app/api/passport/upload/route.ts](src/app/api/passport/upload/route.ts) — the existing blob upload pattern to adapt (not copy).
- [src/lib/file-storage/vercel-blob-storage.ts](src/lib/file-storage/vercel-blob-storage.ts).

## Design constraints

1. **AI cannot author images.** The `image` block is only created via the authenticated upload route. The model may not call `AppendImage*` — and there is no such tool. If the model writes `UpdateBlock` on an image block, only the `alt`, `caption`, and `credit` keys are writeable (enforce in the update Zod schema).
2. **Recharts shim**: recharts requires DOM, so chart blocks render inside a `"use client"` island. Wrap the island in a thin RSC shell so the BlockList dispatch stays server-side. Guard the client bundle — the renderer must not leak into the share bundle (see `scripts/check-share-bundle.ts`).
3. **Chart accessibility**: every chart must ship a descriptive `aria-label` built from `title` + `description`. Series labels are announced via `role='list'` fallback.
4. **Table accessibility**: render with `<caption>` and `<th scope='col'>` for headers. Rows are `<tbody>`.
5. **Callout/quote typography**: `tone='quote'` picks up the brief theme's `--font-serif` (likely Fraunces). Other tones stay in the sans stack.
6. **Schema-version discipline**: every new `content_json` shape includes `schema_version: 1`. Add a top-level comment in each Zod schema explaining the versioning convention.
7. **Telemetry emits are additive.** Do NOT rename any existing envelope. Add new keys to the envelope catalogue, register them in the emit helpers, extend the contract tests.
8. **Scope fence — do NOT touch**:
   - Existing migrations 0000..0022.
   - `src/lib/db/pg/repositories/access-scope.ts` (frozen).
   - Anything under `src/lib/ai/tools/kb/**`.
   - `atlas.brief_citations` or `atlas.brief_templates` tables (owned by 3e-d).
   - The `surfaceKnowledgeBase` tool.

## Tests required

- **Unit**: dispatcher test cases per new verb — `appendChart` / `appendTable` / `appendCallout` / `appendDivider` each with a valid payload → assert repository `create` called with the correct `type` + `contentJson`, and `revalidatePath` called with the briefId.
- **Unit**: Zod rejection tests — invalid `variant`, empty `rows`, invalid `tone`, invalid image mime type (via the route handler).
- **Unit**: image route — authorised user can upload; unauthorised fails 403; file > 8 MB fails 413; non-image mime fails 415.
- **Component**: each renderer has a deterministic snapshot test under `src/components/brief/blocks/renderers/`.
- **Bundle**: `scripts/check-share-bundle.ts` must pass. Ensure the chart client island is NOT imported by any server-rendered share path.

## Gates

Run locally before PR:

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build:local`
- `pnpm exec tsx scripts/check-share-bundle.ts`
- `pnpm db:migrate` on a dev DB

## PR description must include

- Screenshot grid showing one of each new block type rendered inside a brief.
- Screenshot of the editable-block-list "Add image" flow end-to-end (pick file → block appears).
- Confirmation that chart/table/callout/image/divider each respect `size` + `span` from 3e-b.
- Test count delta.
- Migration slot attestation (`0023_...` used, 0024+ left untouched).
- Scope-fence attestation.

## Out of scope

- Inline editing of chart series labels or table cell content — deferred to **3e-e**.
- Citations or bibliography blocks — owned by **3e-d**.
- Brief templates / theming — owned by **3e-d**.
- Any change to the chat route's system prompt beyond auto-registering the new tools via `APP_DEFAULT_TOOL_KIT`.
