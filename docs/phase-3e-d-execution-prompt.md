# Task: Phase 3e-d — Citations + theming for briefs

## Repo & branch

- Repo: `DayoOdunlami/InnovationAtlas4.0`
- Branch off: `main` (after Phase 3e-c has merged — you need the new block type CHECK constraint)
- Create branch: `feat/phase-3e-d-citations-theming`
- Open a PR when done with title: `feat(brief): Phase 3e-d — citations + named templates`

## Migration slot reserved for you

Use **`0024_atlas_brief_citations_templates_phase3ed.sql`**. Do NOT use 0022 (3e-b) or 0023 (3e-c).

## Mission

Give briefs:

1. A **hybrid citations model** — inline footnote markers on the citing block, plus a separate `atlas.brief_citations` lookup table for the bibliography and analytics.
2. **Named templates** — three seeded built-ins (`white-paper`, `explore-report`, `passport-report`), swappable from a header dropdown. No in-app editor; templates are data seeded in the migration.

## Deliverables

### 1. Schema — atlas.brief_citations

Add a new table in [src/lib/db/pg/schema.pg.ts](src/lib/db/pg/schema.pg.ts):

```ts
export const AtlasBriefCitationsTable = atlasSchema.table(
  "brief_citations",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => AtlasBriefsTable.id, { onDelete: "cascade" }),
    blockId: text("block_id")
      .notNull()
      .references(() => AtlasBlocksTable.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => AtlasKnowledgeDocumentsTable.id, {
        onDelete: "restrict",
      }),
    chunkId: uuid("chunk_id").references(
      () => AtlasKnowledgeChunksTable.id,
      { onDelete: "set null" },
    ),
    quotedText: text("quoted_text").notNull(),
    marker: integer("marker").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("brief_citations_brief_idx").on(t.briefId),
    index("brief_citations_block_idx").on(t.blockId),
    unique("brief_citations_brief_marker_uniq").on(t.briefId, t.marker),
  ],
);
```

`marker` is an auto-incrementing integer per brief (use a repository-level `MAX + 1` inside a transaction — do NOT use `SERIAL`; we need deterministic ordering that survives deletes). Each marker is rendered as `[^N]` inline and as `N.` in the bibliography.

### 2. Schema — atlas.brief_templates

```ts
export const AtlasBriefTemplatesTable = atlasSchema.table("brief_templates", {
  id: text("id").primaryKey().notNull(),
  displayName: text("display_name").notNull(),
  tokensJson: jsonb("tokens_json").notNull(),
  defaultBlockSizes: jsonb("default_block_sizes").notNull(),
  coverBlockPreset: jsonb("cover_block_preset"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
```

And widen `atlas.briefs`:

```sql
ALTER TABLE atlas.briefs
  ADD COLUMN template_id text NOT NULL DEFAULT 'white-paper'
  REFERENCES atlas.brief_templates(id);
```

Seed three rows in the migration:

| `id` | `display_name` | Notes |
|---|---|---|
| `white-paper` | Atlas White Paper | Long-form prose, paragraph + citation-heavy. `tokensJson` sets `--font-body: serif`, warm background, narrow max-width. |
| `explore-report` | Explore Report | Landscape-embed forward. `tokensJson` sets `--font-body: sans`, dark background, wide grid. |
| `passport-report` | Passport Report | Live-passport-view forward. `tokensJson` sets standard brief tokens, mid-width. |

Design the `tokensJson` as a flat key-value map of CSS custom properties that every renderer already reads. Example:

```json
{
  "--font-body": "var(--font-sans)",
  "--font-heading": "var(--font-serif)",
  "--brief-bg": "var(--background)",
  "--brief-fg": "var(--foreground)",
  "--brief-max-width": "880px"
}
```

`defaultBlockSizes` is a map like `{ "landscape-embed": "md", "chart": "md", "table": "lg" }`, consulted by the dispatcher when `size` is not supplied explicitly.

### 3. Repository + AccessScope

Add `src/lib/db/pg/repositories/brief-citation-repository.pg.ts` with:

- `listByBrief(briefId, scope)` — returns ordered by `marker`.
- `create({ briefId, blockId, documentId, chunkId, quotedText }, scope)` — computes the next `marker` inside a transaction, inserts, returns the row.
- `deleteByBlock(blockId, scope)` — cascades when a block is removed; `briefId` deletion cascades via FK.

Add `src/lib/db/pg/repositories/brief-template-repository.pg.ts` with `list()` and `getById(id)` — public read, no scope gate (templates are global metadata).

Both repos enforce the authenticated user's `AccessScope` on the brief, not on the citation row itself (citations inherit brief ownership).

### 4. Inline markers on paragraph + bullets

Extend the Zod schemas in [src/lib/ai/tools/blocks/index.ts](src/lib/ai/tools/blocks/index.ts):

- `ParagraphContent.footnotes` — optional array of `{ marker: number, citationId: string }`. Markers align with the `[^N]` tokens inside `text`.
- `BulletsContent.footnotes` — same shape, scoped to items.

Renderers in [src/components/brief/blocks/renderers/paragraph.server.tsx](src/components/brief/blocks/renderers/paragraph.server.tsx) and `bullets.server.tsx` turn every `[^N]` token into a superscript anchor that links to `#citation-{N}` — the anchor lives on the Citation block renderer added below.

### 5. Citation block kind

Add a new block `type='citation'` (already in the CHECK constraint). Its `content_json`:

```ts
{
  schema_version: 1,
  style: "numeric" | "inline"  // numeric = numbered bibliography (default)
}
```

Renderer `src/components/brief/blocks/renderers/citation.server.tsx`:

- Calls `briefCitationRepository.listByBrief(briefId, scope)` and renders an ordered list.
- Each entry: `[N] {document.title} — {publisher}, {year}. "{quotedText}"` (quote preview truncated to 240 chars, with `…`).
- Each entry has `id={\`citation-${marker}\`}` so inline markers scroll to it.
- Idempotent: appending a second citation block replaces the previous one (the dispatcher enforces "one citation block per brief" — see §7).

### 6. Knowledge-base wiring

When the AI calls `AppendParagraph` / `AppendBullets` with `footnotes` referencing `documentId` + `quotedText` produced by `surfaceKnowledgeBase` (see [src/lib/ai/tools/kb/surface-knowledge-base.ts](src/lib/ai/tools/kb/surface-knowledge-base.ts)), the dispatcher must:

1. For each footnote, call `briefCitationRepository.create(...)` to obtain a `marker` + citation `id`.
2. Rewrite the `contentJson.footnotes` with the freshly assigned markers (so the model's placeholder markers are normalised brief-wide).
3. Persist the block with the rewritten `footnotes`.
4. Emit telemetry `brief_citation_recorded` with `{ briefId, blockId, documentId }`.

If the AI cites a `documentId` that is not in `atlas.knowledge_documents`, reject with `invalid_input` — no silent fallback.

### 7. `AppendCitationBlock` tool

Add a new tool `DefaultToolName.AppendCitationBlock` with input `{ briefId, style?: 'numeric' }`. Dispatcher behaviour:

- If a citation block already exists for the brief, update it (idempotent) — do NOT duplicate.
- Otherwise, append at the end of the brief with `size='full'`.
- Call `revalidateBriefPage(briefId)`.

Add to `BRIEF_ID_TOOLS` in [src/lib/ai/tools/blocks/briefing-tool-kit.ts](src/lib/ai/tools/blocks/briefing-tool-kit.ts).

### 8. Template dropdown

In the brief header (rendered by the page at [src/app/(shared-brief)/brief/[id]/page.tsx](src/app/(shared-brief)/brief/[id]/page.tsx) or its header component), add:

- A `<select>` / shadcn `<Select>` populated from `briefTemplateRepository.list()`.
- Owner-only (share scope hides it).
- On change, calls a new server action `setBriefTemplate({ briefId, templateId })` which:
  - Updates `atlas.briefs.template_id`.
  - `revalidatePath(\`/brief/${briefId}\`)`.
  - Emits telemetry `brief_template_changed`.

The brief root wrapper (the `<div>` in `brief-chat-shell.tsx` that hosts `blocksSlot`) gets `style={toCssVars(template.tokensJson)}` so every renderer inherits the tokens via CSS custom properties.

### 9. AI system prompt update

Extend the briefing system prompt in [src/lib/ai/prompts/brief-context.ts](src/lib/ai/prompts/brief-context.ts) (or wherever the current `buildBriefContextSystemPrompt` lives) with:

- Explicit instruction that `surfaceKnowledgeBase` returns `citationPrefix` / `documentId` / `quotedText` that MUST be included as `footnotes` on the citing paragraph or bullet.
- The AI should end a KB-grounded brief by calling `AppendCitationBlock` once.

## Required context files to read

- [AGENTS.md](AGENTS.md) (scope + telemetry + no-silent-fallback rules).
- [docs/phase-3e-c-execution-prompt.md](docs/phase-3e-c-execution-prompt.md) — for the citation block kind you are extending.
- [src/lib/db/pg/schema.pg.ts](src/lib/db/pg/schema.pg.ts) — tables `AtlasBriefsTable`, `AtlasBlocksTable`, `AtlasKnowledgeDocumentsTable`, `AtlasKnowledgeChunksTable`.
- [src/lib/ai/tools/kb/surface-knowledge-base.ts](src/lib/ai/tools/kb/surface-knowledge-base.ts) — source of `documentId` / `citationPrefix` / quoted text.
- [src/lib/ai/tools/blocks/index.ts](src/lib/ai/tools/blocks/index.ts) — dispatcher extension site.
- [src/lib/ai/tools/blocks/briefing-tool-kit.ts](src/lib/ai/tools/blocks/briefing-tool-kit.ts) — `BRIEF_ID_TOOLS`.
- [src/components/brief/blocks/renderers/paragraph.server.tsx](src/components/brief/blocks/renderers/paragraph.server.tsx) and `bullets.server.tsx`.
- [src/app/(shared-brief)/brief/[id]/page.tsx](src/app/(shared-brief)/brief/[id]/page.tsx) — header & template dropdown site.
- [src/app/(shared-brief)/brief/[id]/actions.ts](src/app/(shared-brief)/brief/[id]/actions.ts) — server-action pattern.

## Design constraints

1. **Citations inherit brief AccessScope.** All citation reads/writes must call the brief repo for ownership first. No direct table queries.
2. **Markers are brief-unique.** The migration's `unique(brief_id, marker)` constraint enforces this. The repository computes `marker` inside a serialisable transaction so parallel AI calls can't collide. If two parallel tool calls race, one retries.
3. **Citation block is idempotent.** Exactly one per brief, regardless of how many times the AI calls `AppendCitationBlock`.
4. **Templates are data, not code.** No conditional rendering based on `templateId` beyond the CSS-variable plumbing; every renderer remains template-agnostic. A future template can be added via a migration, without code changes.
5. **Share-scope rendering of citations stays static.** The share bundle must not pull any citation-creation code paths; only the read-only `listByBrief` is allowed. Verify with `scripts/check-share-bundle.ts`.
6. **No in-app template editor.** The header dropdown is the only UI surface. `tokensJson` is authoritative; no computed fallbacks.
7. **Scope fence — do NOT touch**:
   - Migrations 0000..0023.
   - `src/lib/db/pg/repositories/access-scope.ts`.
   - KB-1 tables / KB tools (read-only references are fine).
   - Any file owned by 3e-b (`size` / `span`) or 3e-c (new block renderers) beyond additive prop extensions.

## Tests required

- **Unit**: `brief-citation-repository.pg.test.ts` — `create` produces monotonically increasing `marker` values per brief, respects scope, rejects cross-brief writes.
- **Unit**: dispatcher test case — `AppendParagraph` with 2 footnotes → 2 rows in `atlas.brief_citations`, markers are rewritten, `revalidatePath` called.
- **Unit**: dispatcher test — `AppendCitationBlock` called twice → still one citation block row in `atlas.blocks` for the brief.
- **Unit**: template repository — `list()` returns the three seeds in stable order; `getById('white-paper')` returns non-null.
- **Component**: paragraph renderer with footnotes → renders `<sup><a href="#citation-1">[1]</a></sup>`; clicking the anchor navigates to the citation row.
- **Component**: citation renderer produces stable `id={\`citation-${marker}\`}` anchors for every row.
- **Snapshot**: brief rendered under each of the three template IDs produces distinct computed styles on the wrapper (confirm via `data-template-id`).

## Gates

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build:local`
- `pnpm exec tsx scripts/check-share-bundle.ts`
- `pnpm db:migrate`

## PR description must include

- Screenshot: paragraph block with inline footnote markers `[1]`, `[2]` and corresponding bibliography at the bottom of the brief.
- Screenshots of the brief rendered under each of the three seeded templates.
- Database snapshot showing `brief_citations` rows with monotonically increasing markers.
- Test count delta.
- Migration slot attestation: `0024_atlas_brief_citations_templates_phase3ed.sql` used.
- Scope-fence attestation.

## Out of scope

- Custom template editor — never. Templates are seeded data only.
- Footnote markers on blocks other than `paragraph` / `bullets` / `callout` (callout support can be deferred; omit if it increases risk).
- Cross-brief citation reuse.
- Any change to the `surfaceKnowledgeBase` tool's output schema.
- Inline editing of chart/table labels — deferred to **3e-e**.
