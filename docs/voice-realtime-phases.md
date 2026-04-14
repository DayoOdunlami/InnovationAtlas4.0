# OpenAI Realtime voice — Phase A (done) and Phase B

## Phase A (implemented)

1. **Voice system prompt** — `VOICE_REALTIME_RESPONSE_APPENDIX` in `src/lib/ai/prompts.ts`, merged in `src/app/api/chat/openai-realtime/route.ts` after speech + MCP customization prompts. Brevity, defer to on-screen details, 15k tool output cap, no raw JSON narration.

2. **JARVIS / MCP session** — Realtime already loads tools from `agent.instructions.mentions` when `agentId` is posted. Voice entry points previously cleared `agentId`; they now set it from the active thread’s `@agent` mention via `agentIdForVoiceFromThreadMentions` (`src/lib/chat/agent-id-for-voice.ts`) in:
   - `src/components/prompt-input.tsx` (mic)
   - `src/components/layouts/app-header.tsx` (header mic)
   - `src/components/chat-bot-voice.tsx` (keyboard shortcut)

3. **Client mentions for agent** — `chat-bot-voice.tsx` passes both `mcpTool` and `mcpServer` mentions when an agent is selected (matches JARVIS seed: `mcpServer` for `supabase-atlas`).

4. **No-agent MCP** — Realtime `POST` accepts `allowedMcpServers` (same shape as text chat). When there are no MCP mentions, the server binds tools from that map. The voice hook sends the store’s `allowedMcpServers` from `ChatBotVoice`.

5. **Voice UI** — In-drawer agent picker (all agents + “no agent”), syncs `@agent` on the current thread when a thread exists. Changing agent while a call is active stops the session so you can press Start again with the new tool set.

## Slice A (implemented)

- **`listPassports` in voice:** defined in `VOICE_TOOLS_SLICE_A` in `voice-default-tools.ts` and registered together with slice B via `VOICE_VOICE_DEFAULT_PASSPORT_TOOLS` in `openai-realtime/route.ts` when `ENABLE_VOICE_DEFAULT_TOOLS !== "0"`.
- **Server:** `src/app/actions/execute-voice-default-tool.ts` → `runListPassportsQuery()` (shared with `list-passports-tool.ts`).
- **Client:** `use-voice-chat.openai.ts` routes allowlisted names before MCP; `function_call_output` uses compact `realtimePayload`, drawer UI uses `cardPayload`.

## Slice B (implemented)

- **`extractClaimsPreview` and `showClaimExtraction` in voice:** `VOICE_TOOLS_SLICE_B` in `voice-default-tools.ts`; session registration uses `VOICE_VOICE_DEFAULT_PASSPORT_TOOLS` (slices A + B) when `ENABLE_VOICE_DEFAULT_TOOLS !== "0"`.
- **Server:** same action → `runExtractClaimsPreview` / `runShowClaimExtraction` with the same Zod input schemas as the text tools.
- **Client:** `voiceDefaultToolNamesAllowlist` includes all three names; tool UI still uses `DefaultToolName` so `ClaimPreviewCard` and `ClaimExtractionCard` render in the voice drawer.

## Slice C (implemented)

- **`runMatching` and `showMatchList` in voice:** `VOICE_TOOLS_SLICE_C` in `voice-default-tools.ts`; `VOICE_VOICE_DEFAULT_PASSPORT_TOOLS` now merges A + B + C.
- **Server:** `execute-voice-default-tool.ts` → `runMatchingRunner()` (embedding + Claude + pgvector, 30–60 s) and `runShowMatchListRunner()` (DB read). Both extracted as shared runners from their respective tool files so text chat is unchanged.
- **Spoken UX:** `match_score` (0–1 float) is formatted as `Math.round(score × 100)%` in all spoken summaries. `VOICE_REALTIME_RESPONSE_APPENDIX` instructs the model to announce a 30-second wait before calling `runMatching`.
- **MatchListCard field names:** `MatchListOutput.matches: MatchRow[]` — fields `title`, `lead_funder`, `match_score`, `match_type`, `match_summary`, `gaps`, `funding_amount`, `deadline`.
- **Latency note:** `runMatching` in voice is accepted as a slow call for demo purposes. If latency proves unacceptable, remove `runMatching` from `VOICE_TOOLS_SLICE_C` and expose `showMatchList` only (reads pre-computed results).

## Manual tests (Phase B+ Slice C)

T1: Voice + JARVIS → "Run matching for my [passport name] passport"
  PASS: JARVIS announces 30-second wait; MatchListCard renders in voice drawer; spoken score uses integer %.
T2: Voice → "Show me my matches"
  PASS: `showMatchList` reads existing atlas.matches; MatchListCard renders.
T3: Spoken score format — PASS: "87%" not "0.87".
T4: Regression — text chat `runMatching` / `showMatchList` unchanged.

## Phase B (passport / default toolkit in voice)

**Goal:** Spoken + UI parity for passport demos (`ClaimExtractionCard`, `MatchListCard`, etc.).

**Tools to wire first (typical demo):**

- `extractClaimsPreview` — extract claims from spoken description
- `listPassports` — list user passports
- `runMatching` — cross-sector matching
- `createDraftPitch` — pitch generation  
  (Add others as needed: `saveClaimsToPassport`, `showGapAnalysis`, …)

**Dispatcher architecture (sketch):**

- Server action (e.g. `executeVoiceDefaultTool`) with an **allowlist** of tool names and validated input (zod).
- Realtime session registers **JSON Schema–only** function definitions for those tools (same pattern as MCP conversion).
- Client: if `function_call` name is in allowlist → call server action → send `function_call_output` on the data channel (15k cap already in `use-voice-chat.openai.ts`).

**Persistence / UI:**

- **Voice drawer only:** Dispatcher + Realtime tools + existing `ToolMessagePart` may be enough if generic or tool-specific UI is acceptable.
- **Main thread + cards:** Also persist voice turns and tool parts to `chatRepository` / active `useChat` thread, and ensure tool names align with `DefaultToolName.*` if you need `ClaimExtractionCard` branches (MCP `createMCPToolId` names do not match those branches today).

**Effort (rough):** Dispatcher + allowlist + 2–3 passport tools + manual E2E: small–medium sprint. Adding full thread persistence and card parity: medium+.

## Manual tests (Phase A)

With JARVIS selected on a thread, open voice from the prompt mic or header. Use Supabase MCP–only scenarios (Atlas projects). Passport-only prompts remain Phase B.

After tests, run `pnpm test:smoke` (expect 5/5 when env is configured).
