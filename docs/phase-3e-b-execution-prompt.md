# Task: Phase 3e-b — Hybrid layout primitives for briefs

## Repo & branch

- Repo: `DayoOdunlami/InnovationAtlas4.0`
- Branch off: `main` (after Phase 3e-a has merged)
- Create branch: `feat/phase-3e-b-brief-layout`
- Open a PR when done with title: `feat(brief): Phase 3e-b — hybrid size/span layout primitives`

## Migration slot reserved for you

Use **`0022_atlas_blocks_size_span_phase3eb.sql`**. Do NOT use 0020 or 0021 — those are taken by Phase 3b and KB-1. 0023+ belongs to sibling parallel work (3e-c and 3e-d).

## Mission

Extend the brief block list from a purely linear `flex flex-col` layout to a **hybrid layout model** so AI-generated reports can mix full-width prose with side-by-side charts, tables, and images without the author having to write CSS.

The model (already decided — do not re-negotiate):

- Every block carries `{ size: 'sm' | 'md' | 'lg' | 'full', span?: 4 | 6 | 8 | 12 }`.
- `size` controls the block's visual footprint (max width / max height hints).
- `span` is optional and only meaningful inside a 12-column grid.
- The BlockList component switches to `grid grid-cols-12` only when **any** block in the brief has a non-null `span`. Otherwise it stays a vertical stack (backwards-compatible with every brief written before this phase).
- For `landscape-embed` blocks: `size=sm` or `size=md` must render a **static top-down 2D snapshot** (report-ready, no three.js); only `size=lg` or `size=full` gets the full 3D interactive lens. The existing SVG renderer at `src/components/brief/blocks/renderers/landscape-embed.server.tsx` already produces a static snapshot — reuse it for small sizes.

## Deliverables

### 1. Schema migration (required)

Add two columns to `atlas.blocks`:

```sql
ALTER TABLE atlas.blocks
  ADD COLUMN size text NOT NULL DEFAULT 'md',
  ADD COLUMN span integer NULL;

ALTER TABLE atlas.blocks
  ADD CONSTRAINT blocks_size_chk
    CHECK (size IN ('sm', 'md', 'lg', 'full'));

ALTER TABLE atlas.blocks
  ADD CONSTRAINT blocks_span_chk
    CHECK (span IS NULL OR span IN (4, 6, 8, 12));
```

Update the Drizzle schema in [src/lib/db/pg/schema.pg.ts](src/lib/db/pg/schema.pg.ts) `AtlasBlocksTable` to reflect the new columns + CHECK clauses. Run `pnpm db:generate` if you need a generated diff, but hand-author the migration file to match the slot number.

### 2. Repository + types

Add `size` + `span` to:

- `AtlasBlockEntity` / `AtlasBlockInsert` (automatic via Drizzle once the schema is updated).
- The `BlockRow` type used by the renderer in [src/components/brief/blocks/types.ts](src/components/brief/blocks/types.ts).
- `pgBlockRepository.create` and `pgBlockRepository.update` must accept and persist both fields (defaults: `size='md'`, `span=null`).

### 3. Block list — grid activation

In [src/components/brief/blocks/block-list.server.tsx](src/components/brief/blocks/block-list.server.tsx):

- Compute `const hasSpan = blocks.some((b) => b.span != null);`.
- When `hasSpan` is false, keep the current `flex flex-col gap-4` container (zero regression).
- When `hasSpan` is true, render a `grid grid-cols-12 gap-4` container.
- Each block wraps in a `<div>` that sets:
  - `col-span-{span}` when `span` is set, otherwise `col-span-12`.
  - An inline `maxWidth` / `maxHeight` resolved from a small `sizeToBounds` map:
    - `sm` → `maxWidth: 320px`
    - `md` → `maxWidth: 640px`
    - `lg` → `maxWidth: 960px`
    - `full` → no max.

### 4. Landscape-embed sizing

[src/components/brief/blocks/renderers/landscape-embed.server.tsx](src/components/brief/blocks/renderers/landscape-embed.server.tsx) and its client counterpart must:

- Accept `size` as a prop (plumbed down from BlockList).
- Render the existing static SVG thumbnail for `size ∈ {'sm', 'md'}` (already the default — just make it respect smaller aspect ratios for `sm`).
- Mount the interactive lens (via `next/dynamic({ ssr: false })`) only for `size ∈ {'lg', 'full'}`.
- Respect the enforced aspect ratio per size:
  - `sm`: `aspect-[4/3]`
  - `md`: `aspect-[16/9]` (current default)
  - `lg`: `aspect-[16/10]`
  - `full`: `aspect-[21/9]`

### 5. AI tool surface

Extend the Zod input schemas in [src/lib/ai/tools/blocks/index.ts](src/lib/ai/tools/blocks/index.ts):

- `AppendHeading`, `AppendParagraph`, `AppendBullets`, `AppendLandscapeEmbed`, `AppendLivePassportView` — each gains optional `size` (default `'md'`) and optional `span` (no default, nullable).
- `UpdateBlock` gains optional `size` and `span`.
- `dispatchBlockTool` must persist both fields on every `append*` path and the `UpdateBlock` path. The `revalidatePath` calls added in 3e-a remain in place.

Document the new options in each tool's `description` so the model knows it can say e.g. "append a chart at size `lg` spanning 6 columns".

### 6. Gutter size/span picker (owner only)

In [src/components/brief/blocks/editable/editable-block-list.client.tsx](src/components/brief/blocks/editable/editable-block-list.client.tsx):

- Add a small popover/button in the hover gutter next to the existing drag handle. The popover has two radio groups (`size` and `span`).
- Submitting the popover calls an **extension** of the existing `updateBlock` server action in [src/app/(shared-brief)/brief/[id]/actions.ts](src/app/(shared-brief)/brief/[id]/actions.ts) to patch `size` / `span` — reuse the current `useOptimistic` flow.
- Disable the picker for share-scope viewers.

## Required context files to read

- [AGENTS.md](AGENTS.md) — especially §Architecture Rules 4, 6, 13 (AccessScope + tool dispatch discipline).
- [src/lib/db/pg/schema.pg.ts](src/lib/db/pg/schema.pg.ts) — `AtlasBlocksTable` (lines ~533–565).
- [src/lib/db/pg/repositories/block-repository.pg.ts](src/lib/db/pg/repositories/block-repository.pg.ts) — where `create` / `update` must now accept the new fields.
- [src/components/brief/blocks/block-list.server.tsx](src/components/brief/blocks/block-list.server.tsx) — the current render site.
- [src/components/brief/blocks/editable/editable-block-list.client.tsx](src/components/brief/blocks/editable/editable-block-list.client.tsx) — the DnD + optimistic UI pattern to extend.
- [src/components/brief/blocks/renderers/landscape-embed.server.tsx](src/components/brief/blocks/renderers/landscape-embed.server.tsx) — static SVG thumbnail reused for `sm`/`md`.
- [src/app/(shared-brief)/brief/[id]/actions.ts](src/app/(shared-brief)/brief/[id]/actions.ts) — server action pattern with `revalidatePath`.
- [src/lib/ai/tools/blocks/index.ts](src/lib/ai/tools/blocks/index.ts) — `BLOCK_TOOL_SCHEMAS` and `dispatchBlockTool` (both must be updated).
- [src/lib/ai/tools/blocks/briefing-tool-kit.ts](src/lib/ai/tools/blocks/briefing-tool-kit.ts) — the factory that wires dispatcher tools to the model; no structural change needed, but the stripped-brief-id list (`BRIEF_ID_TOOLS`) must still cover every tool that takes a `briefId`.

## Design constraints

1. **Backwards compatibility**: existing briefs have `size='md'` and `span=null` after the migration. The `flex flex-col` container stays the rendered output for every pre-3e-b brief. No visual regression.
2. **AccessScope discipline**: do NOT read or write `size` / `span` from anywhere other than the repository. The dispatcher must pass the new fields through to `pgBlockRepository.create` / `.update` and never bypass it.
3. **No silent fallback**: if the AI sends an invalid `size` or `span`, the Zod schema MUST reject it with `invalid_input` — same pattern as every other block tool. Clamping is forbidden.
4. **Share-scope safety**: the gutter popover must not mount on share-scope routes. It lives inside the owner-only editable block list, not the RSC BlockList.
5. **Scope fence — do NOT touch**:
   - Existing migrations 0000..0021.
   - `src/lib/db/pg/repositories/access-scope.ts` (frozen).
   - Any file under `src/components/landscape/force-graph-lens/**` beyond the new `size`-aware wrapper around it.
   - Anything under `src/lib/ai/tools/kb/**`.
   - Any brief_citations / brief_templates tables (owned by 3e-d).

## Tests required

- **Unit**: dispatcher tests in [src/lib/ai/tools/blocks/dispatcher.test.ts](src/lib/ai/tools/blocks/dispatcher.test.ts) — add a case per append verb that asserts `size='lg'` + `span=6` are persisted through to the repository stub.
- **Unit**: new file `src/components/brief/blocks/block-list.server.test.tsx` — fixture-driven snapshot that confirms a brief with all `span=null` renders `flex flex-col`, and a brief with any `span` set renders `grid grid-cols-12`.
- **Unit**: Zod — adding `size='bogus'` to any append input must fail validation.
- **Component**: editable-block-list gutter popover — opens, shows both radio groups, calls the updated server action on submit.
- **Snapshot**: landscape-embed renderer at `size='sm'` emits the static SVG (no `<canvas>` / no dynamic import) — guards the share-bundle invariant.

## Gates

Run locally before PR:

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build:local`
- `pnpm exec tsx scripts/check-share-bundle.ts`
- `pnpm db:migrate` against a local dev DB to confirm the migration applies cleanly.

## PR description must include

- Screenshot of a brief rendered in the legacy linear layout (any pre-3e-b brief).
- Screenshot of a brief with at least two side-by-side blocks (span-based grid active).
- Screenshot of a landscape-embed block at `size='sm'` showing the static top-down snapshot.
- Test count delta.
- Migration slot attestation: `0022_atlas_blocks_size_span_phase3eb.sql` used; schema.pg.ts updated accordingly.
- Scope-fence attestation (no edits to 0000..0021 or to any file listed in the scope fence above).

## Out of scope

- New block types (`chart`, `table`, `callout`, `image`, `divider`) — those ship in **3e-c**.
- Citations table / template dropdown — those ship in **3e-d**.
- Inline form for editing chart/table labels — deferred to **3e-e**.
- Any changes to `atlas.briefs` or to chat-route behaviour beyond the Zod schema extensions.
