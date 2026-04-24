# Task: Phase 3e-e — Inline gutter form for AI-authored visuals

> **Status**: deferred. Queue this after Phase 3e-d merges. ≈ half a day of work.

## Repo & branch

- Repo: `DayoOdunlami/InnovationAtlas4.0`
- Branch off: `main` (after 3e-d merges)
- Create branch: `feat/phase-3e-e-block-gutter-form`
- PR title: `feat(brief): Phase 3e-e — inline gutter form for chart/table labels`

## Mission

AI-authored `chart` and `table` blocks ship with the model's choice of title, caption, axis labels, and series names. Users often want to tweak those labels without regenerating the block. Give them a hover-revealed inline form that patches the `content_json.title`, `description`, `caption`, `xAxisLabel`, `yAxisLabel`, and `columns[].header` fields — **labels only; data values stay immutable** (regenerate via chat for new data).

## Deliverables

### 1. Shared component

Create `src/components/brief/blocks/BlockGutterForm.client.tsx`:

- `"use client"` component.
- Props: `{ blockId, blockType: 'chart' | 'table', contentJson }`.
- Renders a floating button in the hover gutter (mirrors the existing drag-handle gutter pattern in [src/components/brief/blocks/editable/editable-block-list.client.tsx](src/components/brief/blocks/editable/editable-block-list.client.tsx)).
- Clicking opens a shadcn `<Popover>` with a small form:
  - For `chart`: `title`, `description`, `xAxisLabel`, `yAxisLabel`, and one text input per series name.
  - For `table`: `caption`, and one text input per column header.
- Submit calls the existing `updateBlock` server action in [src/app/(shared-brief)/brief/[id]/actions.ts](src/app/(shared-brief)/brief/[id]/actions.ts) with a **merged** `contentJson` — never overwrite data arrays.
- `useOptimistic` updates the local state immediately; server action triggers `revalidatePath`.

### 2. Zod guard on the server

Extend the `UpdateBlockInput` Zod path in [src/lib/ai/tools/blocks/index.ts](src/lib/ai/tools/blocks/index.ts) so that when the block is `chart` or `table`, the update is **shape-checked against a reduced schema** that only allows label-like fields. Any attempt to mutate `data`, `rows`, or `columns[].key` returns `invalid_input`. This is the durable guard; the client-side popover is the UX.

Helper: `pickEditableLabelFields(type, patch)` — returns a sanitised patch for chart/table types. Plumb it into both the `UpdateBlock` dispatcher path (AI-facing) and the server action (user-facing) so the two entry points stay symmetric.

### 3. Wire into BlockList

Only the editable block list mounts the gutter form — share scope and read-only routes remain untouched. The RSC BlockList is not affected.

## Required context files to read

- [AGENTS.md](AGENTS.md).
- [docs/phase-3e-c-execution-prompt.md](docs/phase-3e-c-execution-prompt.md) — the chart/table `content_json` shapes you are patching.
- [src/components/brief/blocks/editable/editable-block-list.client.tsx](src/components/brief/blocks/editable/editable-block-list.client.tsx) — gutter + optimistic UI pattern.
- [src/app/(shared-brief)/brief/[id]/actions.ts](src/app/(shared-brief)/brief/[id]/actions.ts) — existing `updateBlock` server action.
- [src/lib/ai/tools/blocks/index.ts](src/lib/ai/tools/blocks/index.ts) — `UpdateBlockInput` Zod schema + dispatcher path.
- Existing Plate.js editable renderers are NOT touched; no custom Plate nodes needed.

## Design constraints

1. **Labels only, never data.** The server-side `pickEditableLabelFields` helper is authoritative — it is the only way chart/table content gets merged.
2. **No Plate plugin work.** The form is a plain React popover backed by the server action. Do not introduce a custom Plate node for chart/table.
3. **Owner scope only.** Share-scope viewers never see the gutter form.
4. **Optimistic UI** follows the pattern already in the editable block list (React 19 `useOptimistic`).
5. **Scope fence — do NOT touch**:
   - Migrations / schema.
   - Anything under `src/lib/db/pg/repositories/**` (frozen).
   - The `dispatchBlockTool` control flow beyond adding the `pickEditableLabelFields` guard.
   - `atlas.brief_citations` / `atlas.brief_templates` (owned by 3e-d; read-only here if at all).

## Tests required

- **Unit**: `pickEditableLabelFields('chart', { title, data })` → returns `{ title }` only.
- **Unit**: same for `table` — column `key` edits are stripped; `header` edits pass through.
- **Unit**: `UpdateBlock` dispatcher — an attempt by the AI to mutate a chart's `data` array returns `invalid_input`, telemetry emits `brief_block_tool_rejected` with `reason: 'invalid_input'`.
- **Component**: gutter form open → edit title → submit → optimistic UI renders the new title → server action called once → toast on success.
- **A11y**: popover has a descriptive `aria-label`; form inputs have explicit `<label>`s.

## Gates

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build:local`

## PR description must include

- Screencapture (GIF or still) of the gutter form flow on a chart block.
- Screencapture on a table block.
- Test count delta.
- Scope-fence attestation.

## Out of scope

- Editing the chart/table data itself.
- Any new block types.
- Any migration or schema work.
- Any change to the AI tool surface beyond the `pickEditableLabelFields` guard.
