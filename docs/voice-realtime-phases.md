# OpenAI Realtime voice — Phase A (done) and Phase B

## Phase A (implemented)

1. **Voice system prompt** — `VOICE_REALTIME_RESPONSE_APPENDIX` in `src/lib/ai/prompts.ts`, merged in `src/app/api/chat/openai-realtime/route.ts` after speech + MCP customization prompts. Brevity, defer to on-screen details, 15k tool output cap, no raw JSON narration.

2. **JARVIS / MCP session** — Realtime already loads tools from `agent.instructions.mentions` when `agentId` is posted. Voice entry points previously cleared `agentId`; they now set it from the active thread’s `@agent` mention via `agentIdForVoiceFromThreadMentions` (`src/lib/chat/agent-id-for-voice.ts`) in:
   - `src/components/prompt-input.tsx` (mic)
   - `src/components/layouts/app-header.tsx` (header mic)
   - `src/components/chat-bot-voice.tsx` (keyboard shortcut)

3. **Client mentions for agent** — `chat-bot-voice.tsx` passes both `mcpTool` and `mcpServer` mentions when an agent is selected (matches JARVIS seed: `mcpServer` for `supabase-atlas`).

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
