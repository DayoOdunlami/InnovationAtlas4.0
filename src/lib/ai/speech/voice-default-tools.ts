import { DefaultToolName } from "lib/ai/tools";

/**
 * OpenAI Realtime function definitions for voice default toolkit (vertical slices).
 * Keep this file client-safe: no server-only imports.
 */

export type VoiceRealtimeFunctionDef = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** Slice A — list passports only (validates voice default-tool wiring). */
export const VOICE_TOOLS_SLICE_A: VoiceRealtimeFunctionDef[] = [
  {
    type: "function",
    name: DefaultToolName.ListPassports,
    description:
      "List all existing passports with claim counts. Call when the user asks which passports they have, " +
      "to pick a passport, or before saving claims.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

/** Slice B — claim preview + saved claims card (mirrors text default tools). */
export const VOICE_TOOLS_SLICE_B: VoiceRealtimeFunctionDef[] = [
  {
    type: "function",
    name: DefaultToolName.ExtractClaimsPreview,
    description:
      "Extract structured claims from a spoken or typed innovation description WITHOUT saving them. " +
      "Shows a preview card so the user can review claims and save to a passport. " +
      "Requires at least 20 characters of source text. After preview, use listPassports to help pick where to save.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "Full description or transcript to extract claims from (minimum 20 characters).",
        },
        context_hint: {
          type: "string",
          description:
            "Optional short hint for the extractor (e.g. sector or product focus).",
        },
      },
      required: ["text"],
    },
  },
  {
    type: "function",
    name: DefaultToolName.ShowClaimExtraction,
    description:
      "Show all saved claims for a passport in a structured card (tiers, excerpts, verify/reject). " +
      "Use after the user names a passport or you have a passport UUID from listPassports.",
    parameters: {
      type: "object",
      properties: {
        passport_id: {
          type: "string",
          description: "UUID of the passport whose claims to load.",
        },
        document_id: {
          type: "string",
          description: "Optional: only claims sourced from this document UUID.",
        },
      },
      required: ["passport_id"],
    },
  },
];

/** Slice C — runMatching + showMatchList (cross-sector matching results). */
export const VOICE_TOOLS_SLICE_C: VoiceRealtimeFunctionDef[] = [
  {
    type: "function",
    name: DefaultToolName.RunMatching,
    description:
      "Run the cross-sector matching engine for a passport. Embeds claims, runs pgvector " +
      "similarity, generates summaries via Claude, writes to atlas.matches. " +
      "WARNING: This takes 30–60 seconds. Say a verbal preamble before calling. " +
      "Returns a MatchListCard in the voice panel.",
    parameters: {
      type: "object",
      properties: {
        passport_id: {
          type: "string",
          description: "UUID of the passport to run matching for.",
        },
      },
      required: ["passport_id"],
    },
  },
  {
    type: "function",
    name: DefaultToolName.ShowMatchList,
    description:
      "Display existing cross-sector matches for a passport. Reads from atlas.matches " +
      "(previously written by runMatching). Returns a MatchListCard in the voice panel.",
    parameters: {
      type: "object",
      properties: {
        passport_id: {
          type: "string",
          description: "UUID of the passport to show matches for.",
        },
        limit: {
          type: "number",
          description: "Number of top matches to show (default 5, max 10).",
        },
      },
      required: ["passport_id"],
    },
  },
];

/** All passport voice default tools (slices A + B + C) registered when the env gate is on. */
export const VOICE_VOICE_DEFAULT_PASSPORT_TOOLS: VoiceRealtimeFunctionDef[] = [
  ...VOICE_TOOLS_SLICE_A,
  ...VOICE_TOOLS_SLICE_B,
  ...VOICE_TOOLS_SLICE_C,
];

export const voiceDefaultToolNamesAllowlist = new Set(
  VOICE_VOICE_DEFAULT_PASSPORT_TOOLS.map((t) => t.name),
);
