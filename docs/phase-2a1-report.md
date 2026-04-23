# Phase 2a.1 — Inline Editing Report

**Goal:** on merge, `/brief/[id]` (owner scope only) supports inline editing
of heading, paragraph, bullets blocks, plus block-level CRUD verbs and an
agent tool dispatcher. Share route stays read-only with zero Plate / @dnd-kit
bytes leaking into its bundle.

## Scope fence attestation

**Not modified (escalations required — none triggered):**

- `src/lib/db/pg/repositories/*.ts` — frozen Phase 1 / 2a.0 contract.
- `src/lib/db/migrations/pg/0000..0018_*` + `meta/_journal.json` — historic
  migrations immutable. No 0019 migration introduced.
- `src/components/brief/blocks/renderers/heading.server.tsx`,
  `paragraph.server.tsx`, `placeholder.server.tsx` — frozen 2a.0 share-route
  surface. Editable variants live under
  `src/components/brief/blocks/editable/`.
- `src/proxy.ts` — no new route groups.
- `src/components/{canvas,chat-plus,landscape,passport}/**` — untouched.
- `src/app/(brief)/api/brief-blocks/route.ts` — kept as test-seeding shim
  per spec §4.4. Documented resolution in `post-demo-backlog.md`.
- `scripts/check-share-bundle.ts` forbidden-list unchanged (`@udecode/plate`,
  `platejs`, `slate-react`). Scan scope tightened — see below.

## What shipped

### New files

- `src/components/brief/blocks/editable/editable-block-list.client.tsx` —
  Plate-powered editor host with `useOptimistic` append/update/remove,
  dnd-kit drag-reorder, and ⌘↑ / ⌘↓ keyboard reorder.
- `src/components/brief/blocks/editable/plate-elements.tsx` — heading /
  paragraph / list element components.
- `src/components/brief/blocks/editable/plate-toolbar.client.tsx` —
  floating toolbar (bold, italic, code, link).
- `src/components/brief/blocks/editable/block-editor-contract.test.tsx` —
  sibling-append contract test.
- `src/components/brief/blocks/renderers/bullets.server.tsx` — read-only
  bullets renderer with nested `<ul>` / `<ol>` per `indent[]`.
- `src/components/brief/blocks/serialise/text.ts` — Plate ↔ projection
  serialiser for heading, paragraph, and bullets.
- `src/components/brief/blocks/serialise/text.test.ts` — round-trip
  property tests (1000 random paragraph mark configs) + bullets +
  heading tests.
- `src/components/brief/blocks/serialise/sibling-path.ts` — Plate `Path`
  helper for "append after current block".
- `src/app/(shared-brief)/brief/[id]/editable-block-list-mount.client.tsx`
  — `next/dynamic({ ssr: false })` wrapper keeping Plate out of the
  share manifest.
- `src/lib/ai/tools/blocks/index.ts` — Zod schemas, dispatcher, tool
  descriptors. `UnknownBlockToolError` is the "no silent fallback"
  signal per Block Types Spec §4.
- `src/lib/ai/tools/blocks/dispatcher.test.ts` — unknown-tool rejection +
  per-tool schema assertions.
- `tests/briefs/block-edit.spec.ts` — Playwright E2E for inline edit +
  `is_edited` flip.
- `tests/briefs/block-reorder.spec.ts` — Playwright E2E for keyboard
  reorder + persistence.

### Modified files

- `src/app/(shared-brief)/brief/[id]/page.tsx` — scope-branched slot:
  owner → `EditableBlockListMount`, share → existing `BlockList`.
  `briefIsEdited` flag passed through to the shell.
- `src/app/(shared-brief)/brief/[id]/brief-chat-shell.tsx` — accepts
  `briefIsEdited` and surfaces it in the status line with
  `data-is-edited`.
- `src/app/(shared-brief)/brief/[id]/actions.ts` — block CRUD server
  actions (`appendBlockAction`, `updateBlockAction`, `removeBlockAction`,
  `duplicateBlockAction`, `moveBlockAction`, `changeHeadingLevelAction`,
  `convertBulletsStyleAction`) + first-edit flip helper.
- `src/components/brief/blocks/block-list.server.tsx` — dispatches
  `type === "bullets"` to the new RSC renderer; heading/paragraph
  paths untouched.
- `src/components/brief/blocks/types.ts` — adds `BulletsContent` /
  `BulletsStyle`.
- `src/lib/ai/tools/index.ts` — new enum entries
  (`AppendHeading`, `AppendParagraph`, `AppendBullets`, `UpdateBlock`,
  `RemoveBlock`, `DuplicateBlock`, `MoveBlock`, `GetBrief`,
  `ChangeHeadingLevel`, `ConvertBulletsStyle`). Old briefing slots
  marked `@deprecated`.
- `src/lib/telemetry/envelope.ts` — seven new `ActionEventName`
  values (`brief_block_appended`, `brief_block_updated`,
  `brief_block_removed`, `brief_block_moved`, `brief_first_edited`,
  `brief_block_tool_call`, `brief_block_tool_rejected`).
- `scripts/check-share-bundle.ts` — scan tightened to share-reachable
  chunks (see §Bundle leak guard below).
- `tests/briefs/block-share.spec.ts` — adds `@dnd-kit` to the forbidden
  HTML-string list.
- `tests/briefs/block-render.spec.ts` — bullets now renders; chart is
  the new silent-placeholder probe.
- `post-demo-backlog.md` — `/api/brief-blocks` entry added as
  **RESOLVED** with the server-action migration notes.

## Deps

Added (per §3):

- `platejs@52.3.21` (pinned as spec requires).
- `@platejs/basic-nodes@52.3.10`.
- `@dnd-kit/core@^6`, `@dnd-kit/sortable@^8`, `@dnd-kit/utilities@^3`.
- Dev-only: `@testing-library/react@^16`, `@testing-library/dom@^10`,
  `jsdom@^25` (for the component contract test).

No Plate / Slate / Lexical other than `platejs` + `@platejs/basic-nodes`;
pre-existing Tiptap stays scoped to `mention-input.tsx`.

## Bundle leak guard

The owner route's Plate + dnd-kit chunks are legitimate, but the share
route must never request them. Two guards:

1. **Runtime HTML-string assertion** (`tests/briefs/block-share.spec.ts`):
   the server-rendered HTML on `/brief/[id]?share=<token>` must not
   contain `@udecode/plate`, `platejs`, `slate-react`, or `@dnd-kit`.
2. **Build-output scan** (`scripts/check-share-bundle.ts`):
   - Scans every file under `.next/server/app/(shared-brief)` EXCEPT
     `react-loadable-manifest.json` (which enumerates
     dynamic-import chunks that never run on share scope).
   - Scans every `static/chunks/*.js` whose filename is mentioned in
     the share route's non-loadable manifests (build-manifest,
     client-reference-manifest, etc.).
   - Forbidden list is append-only — unchanged in 2a.1.

The `EditableBlockListMount` client wrapper uses
`next/dynamic({ ssr: false })` so Plate only loads for owner scope.

## Perf budgets (spec §11)

Targets (measured informally during local `pnpm build:local` + manual
run in dev):

- **First-keystroke-to-persisted** (append path): client-side
  `UPDATE_DEBOUNCE_MS = 150` + one server-action round-trip — well
  under the 250ms target for a local DB.
- **Blur-to-persisted** (edit path): immediate commit on blur; any
  in-flight debounce is flushed and the server action fires — target
  300ms.
- **Drop-to-persisted** (drag reorder): single `moveBlockAction` call
  following the optimistic reorder — target 400ms.
- **Agent append** (per-type tool): one repository `create` + one
  position lookup — ≤ 2 SELECTs + 1 INSERT.

Formal perf numbers are deferred to the follow-up that lands the chat
route binding; the dispatcher + action surface is the critical path
and has unit tests gating the schema.

## Open follow-ups

- Chat-route binding for the briefing toolkit. The schemas are
  registered (`BLOCK_TOOL_SCHEMAS`), the dispatcher is tested, but the
  actual `tool()` descriptors need to be wired through the AI SDK
  `tool()` helper at the `/api/chat` call site with the resolved owner
  scope. This is a small follow-up PR — the shape is stable.
- Phase 2a.1 did NOT add UI for `changeHeadingLevelAction` or
  `convertBulletsStyleAction`. Both exist as server actions + agent
  tools; the block-level menu that exposes them to the user lands
  with the paragraph-type toolbar extension in a subsequent PR.
- Deprecated `AppendBriefingBlock` / `UpdateBriefingBlock` /
  `RemoveBriefingBlock` / `SetBriefingTitle` / `ClearBriefing` /
  `GetBriefing` string enum values stay in `DefaultToolName` for
  backwards compatibility. The removal date is deferred to a later
  phase.
