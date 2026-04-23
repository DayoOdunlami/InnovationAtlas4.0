# Task: Phase 3a — live-passport-view block (Brief-First Rebuild)

## Repo & branch

- Repo: `DayoOdunlami/InnovationAtlas4.0`
- Branch off: `main` (currently at tag `phase-2b-close`, sha `a13d1a9`)
- Create branch: `feat/phase-3a-live-passport-view`
- Open a PR when done with title: `feat(blocks): Phase 3a — live-passport-view block`

## Migration slot reserved for you

If you need a new migration, use **`0019_atlas_live_passport_views_phase3a.sql`**. Do **NOT** use 0020 or 0021 — those are reserved for sibling parallel work (Phase 3b and KB-1).

## Mission

Add a new block type `live-passport-view` that renders a **live, realtime-updating passport card** inside a brief. The block type is already in the `atlas.blocks` CHECK constraint (`src/lib/db/pg/schema.pg.ts:557`), so no schema change for the block type is required. You will ship:

1. A new **read-only RSC renderer** for `live-passport-view` blocks that fetches the passport by id from `atlas.passports` and renders a card (fields: title, summary, claims count, last updated).
2. A **client island** (`"use client"`) that wraps the renderer with Supabase Realtime subscription so passport edits in another tab/browser update this card in place — replacing the stale-SWR pattern currently used in `src/components/canvas/stage/canvas-stage-passport.tsx`.
3. An **agent tool** `AppendLivePassportView({ passportId })` that appends a new block of this type. Follow the exact pattern in `src/lib/ai/tools/blocks/index.ts` for append tools (ULID id, fractional-indexing position).
4. A **server action** `appendLivePassportViewAction` mirroring the existing `appendBlockAction` for owner-only writes.
5. **Telemetry:** reuse existing `brief_block_appended` envelope with `{ type: "live-passport-view" }` payload.

## Required context files to read

- `post-demo-backlog.md` — see **"CanvasStagePassport SWR cross-tab stale window"** entry; this 3a work supersedes it.
- `docs/phase-2a1-report.md` — pattern for block renderers + editable mounts.
- `docs/phase-2b-execution-prompt.md` — pattern for tool binding in chat.
- `src/components/brief/blocks/renderers/*.server.tsx` — existing RSC renderer pattern (heading, paragraph, bullets).
- `src/components/brief/blocks/block-list.server.tsx` — dispatch point where you register the new renderer.
- `src/components/canvas/stage/canvas-stage-passport.tsx` — the non-live version; reuse its visual design but swap SWR for Supabase Realtime.
- `src/lib/db/pg/repositories/passport-repository.pg.ts` — existing passport queries.
- `src/lib/ai/tools/blocks/index.ts` — agent tool dispatcher + `BLOCK_TOOL_SCHEMAS`.
- `src/lib/ai/tools/blocks/briefing-tool-kit.ts` — Phase 2b factory; add your new tool name to `BRIEF_ID_TOOLS` set since it takes `briefId`.

## Design constraints

1. **Realtime channel:** use Supabase Realtime on the `atlas.passports` table, filtered by `id=eq.<passportId>`. Unsubscribe on unmount.
2. **Fallback:** if Realtime disconnects, fall back gracefully to a 60s polling refresh (do NOT leave the card stale forever).
3. **Access scope:** the renderer is read-only for both owner and share-scope viewers; reuse the `AccessScope` plumbing in the repository layer. Blocks of type `live-passport-view` carry a `content_json` shape: `{ passportId: string, schema_version: 1 }`.
4. **Bundle leak guard:** the share-route bundle must **NOT** load Supabase Realtime client. Use `next/dynamic({ ssr: false })` to split the realtime subscriber into an owner-only island — same pattern as `editable-block-list-mount.client.tsx`. Update `scripts/check-share-bundle.ts` forbidden list with `@supabase/realtime-js` (append-only).
5. **Scope fence — do NOT touch:**
   - `src/lib/db/pg/repositories/brief-repository.pg.ts`, `block-repository.pg.ts`, `message-repository.pg.ts` (frozen contracts).
   - Existing migrations (`0000_*` through `0018_*`).
   - `src/proxy.ts`, `src/app/(brief)/**`, `src/components/landscape/**`, `src/components/chat-plus/**`.
   - Canvas components except for reading-only context (optional deprecation note in `post-demo-backlog.md`).

## Tests required

- **Unit:** renderer snapshot test (non-live path).
- **Unit:** realtime-subscriber hook behaviour (mock Supabase channel, assert it re-renders on payload, assert cleanup on unmount).
- **Unit:** agent tool dispatcher — `AppendLivePassportView` with valid/invalid `passportId` (UUID).
- **E2E (Playwright, optional):** owner appends a live-passport-view block via chat → refresh → block persists. Skip if too flaky.

## Gates

Run locally before PR:

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build:local`
- `pnpm exec tsx scripts/check-share-bundle.ts`

## PR description must include

- Files added / modified.
- Scope-fence attestation.
- Test count delta (`pnpm test` before vs after).
- Screenshot or description of realtime update working (manually tested).
- Note confirming migration slot `0019` used (or "no migration needed").

## Out of scope

- Editing the passport **from** the block (block is view-only; passport editing stays on `/passport/[id]`).
- Realtime for anything other than `atlas.passports` (messages, blocks, etc. are separate work).
- Canvas integration — `/canvas` still shows the stale SWR version until Phase 4 cutover.
