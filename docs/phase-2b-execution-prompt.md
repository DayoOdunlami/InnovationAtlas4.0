# Phase 2b — Agent writes to the brief (execution prompt)

Use this as the **self-contained instruction set** for a cloud agent (or local agent) implementing **Phase 2b: agent-authored block operations via chat**, on top of **Phase 2a.1** (merged to `main`).

## Mission

Wire the **existing** block tool stack (`src/lib/ai/tools/blocks/index.ts` — `dispatchBlockTool`, `BLOCK_TOOL_SCHEMAS`, `UnknownBlockToolError`) into the **Vercel AI SDK** tool surface used by `POST` `src/app/api/chat/route.ts`, so that when a user is working **in the context of a brief**, the model can call **AppendHeading**, **AppendParagraph**, **AppendBullets**, **UpdateBlock**, **RemoveBlock**, **DuplicateBlock**, **MoveBlock**, **GetBrief**, **ChangeHeadingLevel**, and **ConvertBulletsStyle** with **owner-scoped** writes (session user = scope).

**2b is chat binding + tool exposure + telemetry on tool execution — not** a redesign of blocks, Plate, or repositories.

## Preconditions (verify before coding)

- `main` includes Phase 2a.1: Plate editor on owner `/brief/[id]`, server actions, `pgBlockRepository`, `dispatchBlockTool` + tests.
- `AppDefaultToolkit.Briefing` in `src/lib/ai/tools/tool-kit.ts` is **intentionally empty** (comment documents that binding is Phase 2b).
- CI E2E workflow (`.github/workflows/e2e-tests.yml`) uses `pgvector/pgvector:pg17`, waits for Postgres, bootstraps `vector` + `atlas.passports` stub, then `pnpm db:migrate`.

## Design constraints

1. **AccessScope** — Every mutating path must use `{ kind: "user", userId: session.user.id }` (same as server actions). **Never** infer scope from the model; only from the authenticated session + validated brief ownership.
2. **Brief context** — Tools need a `briefId` (UUID). Choose **one** clear mechanism and document it:
   - **Preferred:** extend `ChatMetadata` (and the chat API request Zod schema) with optional `activeBriefId?: string`, set by the client when the user opens split view / brief assistant; or
   - **Alternative:** a dedicated mention type or thread-level field, if the codebase already has a pattern for “active document”.
   - **Reject** passing `briefId` only inside tool args without tying it to an ownership check in the tool executor (the executor must `getBrief` / `listByBrief` with scope and confirm owner).
3. **Tool kit registration** — Populate `[AppDefaultToolkit.Briefing]` in `APP_DEFAULT_TOOL_KIT` with Vercel AI `tool()` instances whose `execute` calls `dispatchBlockTool` (or thin wrappers that validate `briefId` then dispatch). Reuse Zod input shapes from `BLOCK_TOOL_SCHEMAS` where possible.
4. **When `activeBriefId` is absent** — Do not register Briefing block tools (empty kit), **or** register tools that return a structured error “No active brief in this chat” — pick one; avoid silent no-ops.
5. **Telemetry** — Call existing `brief_block_tool_call` / `brief_block_tool_rejected` (see `envelope.ts`) from the tool execution path; do not add new event names without spec approval.
6. **Scope fence (do not touch without escalation)** — `src/lib/db/pg/repositories/*` contracts, historic migrations, `src/components/canvas/**`, `src/proxy.ts` (unless a new unauthenticated route is required — it is not for 2b).

## Suggested file touch list

- `src/types/chat.ts` — optional `activeBriefId` on `ChatMetadata` (or chosen alternative).
- `src/types/chat.ts` — `chatApiSchemaRequestBodySchema` / `ChatMetadata` — allow the client to send active brief context (e.g. optional `activeBriefId`).
- `src/lib/ai/tools/tool-kit.ts` — implement `[AppDefaultToolkit.Briefing]`.
- `src/app/api/chat/route.ts` (and/or `shared.chat.ts`) — when building `loadAppDefaultTools`, pass session + resolved `activeBriefId` so Briefing tools close over scope.
- Client: brief chat shell or chat-plus layout — when user is on a brief, set `activeBriefId` on outgoing chat messages (minimal UI wiring).

## Tests (minimum)

- **Unit:** tool executor rejects wrong user / wrong brief (mock repo or integration with skipped-if-no-Postgres — follow `hasRealPostgresUrl()` pattern).
- **Unit or integration:** successful `dispatchBlockTool` path from a synthetic `tool.execute` (same as dispatcher tests, but through the Vercel `tool()` wrapper if added).
- **E2E (optional 2b):** skip if flaky; prefer stable API-level test. If adding Playwright, reuse existing `pnpm test:e2e:seed` users.

## Gates

Run locally before PR: `pnpm check-types`, `pnpm lint`, `pnpm test`, `pnpm build:local`.

## Out of scope for 2b

- Full **chat UI** for block-level menus (2a.1 follow-up: heading/bullets convert buttons).
- **Canvas** / **landscape** integration.
- New migrations or new block types.
- Replacing deprecated `AppendBriefingBlock` string enum (defer).

## UI: seeing Phase 2a.1 inline editing locally

1. `pnpm dev` (or `npm run dev` if that is your habit).
2. Sign in with a real user (e.g. demo seed: `pnpm seed:demo` per `AGENTS.md`).
3. Open **`/briefs`**, create or open a brief you own.
4. On **`/brief/[id]`** (no `?share=`): select a **heading / paragraph / bullets** block and edit; drag reorder; confirm persistence after refresh.

**Share URL** (`?share=`): read-only block list (no editor) — by design.

After **2b** merges: the same flow plus chat (with active brief context) can ask the model to append/update blocks; verify in network tab or by refreshed block content.

---

## PR description template (for the agent)

**Title:** `feat(brief): Phase 2b — wire block tools to chat (owner scope)`

**Body:** Summarize: `ChatMetadata` (or chosen) brief context, `AppDefaultToolkit.Briefing` populated, `route.ts` wiring, telemetry, tests. Link this doc. List manual verification: open brief, send chat message that triggers append tool, refresh page.
