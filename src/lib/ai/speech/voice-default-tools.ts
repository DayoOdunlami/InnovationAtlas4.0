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
  {
    type: "function",
    name: DefaultToolName.ArchivePassport,
    description:
      "Archive a passport to remove it from the active list. " +
      "Use when the user asks to clean up, archive, or remove a test passport. " +
      "Archived passports are not deleted and can be restored. " +
      "Requires admin access. passport_id must be a UUID from listPassports.",
    parameters: {
      type: "object",
      properties: {
        passport_id: {
          type: "string",
          description: "UUID of the passport to archive.",
        },
      },
      required: ["passport_id"],
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
      "Returns a MatchListCard in the voice panel. " +
      "IMPORTANT: passport_id must be a UUID from a prior listPassports call — " +
      "never use the passport name or title as the ID.",
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

/** Slice D — showGapAnalysis + createDraftPitch (gap review + pitch generation). */
export const VOICE_TOOLS_SLICE_D: VoiceRealtimeFunctionDef[] = [
  {
    type: "function",
    name: DefaultToolName.ShowGapAnalysis,
    description:
      "Show gap analysis for a passport — missing evidence, TRL gaps, certification gaps, " +
      "conditions mismatches, and what would close each gap. Displays a GapAnalysisCard in the voice panel.",
    parameters: {
      type: "object",
      properties: {
        passport_id: {
          type: "string",
          description: "UUID of the passport to show gap analysis for.",
        },
      },
      required: ["passport_id"],
    },
  },
  {
    type: "function",
    name: DefaultToolName.CreateDraftPitch,
    description:
      "Generate and display a three-paragraph Statement of Intent pitch. " +
      "Write title, paragraph1, paragraph2, and paragraph3 yourself based on the passport evidence and top match. " +
      "Paragraph1: innovation claim and evidence. Paragraph2: cross-sector applicability and target funding call. " +
      "Paragraph3: gaps and next steps to close them.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Pitch title including funder and opportunity name.",
        },
        paragraph1: {
          type: "string",
          description:
            "Innovation claim and evidence — what was proven and under what conditions.",
        },
        paragraph2: {
          type: "string",
          description:
            "Cross-sector applicability — why this evidence applies to the target funding call.",
        },
        paragraph3: {
          type: "string",
          description:
            "Gaps and next steps — what additional evidence is needed and what it would cost.",
        },
        passport_id: {
          type: "string",
          description: "Optional: passport UUID this pitch is based on.",
        },
        funder: {
          type: "string",
          description: "Optional: target funder or funding programme.",
        },
        funding_amount: {
          type: "string",
          description: "Optional: estimated funding amount eligibility.",
        },
      },
      required: ["title", "paragraph1", "paragraph2", "paragraph3"],
    },
  },
];

/**
 * Slice E1 — createBarChart + createTable (visualisation tools).
 * Both are display-only: the model generates all data as input parameters.
 * No runners or server-side execution needed.
 */
export const VOICE_TOOLS_SLICE_E1: VoiceRealtimeFunctionDef[] = [
  {
    type: "function",
    name: DefaultToolName.CreateBarChart,
    description:
      "Generate and display a bar chart. You must produce all chart data yourself based on " +
      "the conversation context (passport matches, claim counts, scores, etc.). " +
      "Provide title, description, yAxisLabel, and a data array where each item has an " +
      "xAxisLabel (category name) and a series array of { seriesName, value } objects. " +
      "Use this when the user asks for a chart, graph, or visual comparison.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Chart title.",
        },
        description: {
          type: "string",
          description: "Optional short description of what the chart shows.",
        },
        yAxisLabel: {
          type: "string",
          description:
            "Label for the Y-axis (e.g. 'Match score', 'Claim count').",
        },
        data: {
          type: "array",
          description:
            "Array of bar groups. Each item: { xAxisLabel: string, series: [{ seriesName: string, value: number }] }.",
          items: {
            type: "object",
            properties: {
              xAxisLabel: { type: "string" },
              series: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    seriesName: { type: "string" },
                    value: { type: "number" },
                  },
                  required: ["seriesName", "value"],
                },
              },
            },
            required: ["xAxisLabel", "series"],
          },
        },
      },
      required: ["title", "data"],
    },
  },
  {
    type: "function",
    name: DefaultToolName.CreateTable,
    description:
      "Generate and display an interactive table. You must produce all rows and column definitions " +
      "yourself based on the conversation context. " +
      "Provide title, columns (key + label + type), and a data array of row objects. " +
      "Use this when the user asks for a table, list, or tabular summary.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Table title.",
        },
        description: {
          type: "string",
          description: "Optional short description of the table.",
        },
        columns: {
          type: "array",
          description:
            "Column definitions: [{ key: string, label: string, type: 'string'|'number'|'date'|'boolean' }].",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              label: { type: "string" },
              type: { type: "string" },
            },
            required: ["key", "label"],
          },
        },
        data: {
          type: "array",
          description:
            "Array of row objects. Keys must match the column key values.",
          items: { type: "object" },
        },
      },
      required: ["title", "columns", "data"],
    },
  },
];

/**
 * Slice E2 — createPieChart + createLineChart.
 * Both are display-only: the model generates all data as input parameters.
 */
export const VOICE_TOOLS_SLICE_E2: VoiceRealtimeFunctionDef[] = [
  {
    type: "function",
    name: DefaultToolName.CreatePieChart,
    description:
      "Generate a pie chart. You must provide the chart data as segments you create " +
      "from the conversation context. Each segment needs a label and numeric value. " +
      "Only use data you have received from a prior tool call — do not invent values.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Chart title.",
        },
        description: {
          type: "string",
          description: "Optional short description of what the chart shows.",
        },
        unit: {
          type: "string",
          description:
            "Optional unit label for segment values (e.g. '£', '%', 'claims').",
        },
        data: {
          type: "array",
          description:
            "Pie segments. Each item: { label: string, value: number }.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "number" },
            },
            required: ["label", "value"],
          },
        },
      },
      required: ["title", "data"],
    },
  },
  {
    type: "function",
    name: DefaultToolName.CreateLineChart,
    description:
      "Generate a line chart. You must provide data points from the conversation context. " +
      "Structure: data array where each item has xAxisLabel and a series array with " +
      "seriesName and value. Only use data from prior tool calls — do not invent values.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Chart title.",
        },
        description: {
          type: "string",
          description: "Optional short description.",
        },
        yAxisLabel: {
          type: "string",
          description:
            "Label for the Y-axis (e.g. 'Match score', 'Claim count').",
        },
        data: {
          type: "array",
          description:
            "Data points. Each item: { xAxisLabel: string, series: [{ seriesName: string, value: number }] }.",
          items: {
            type: "object",
            properties: {
              xAxisLabel: { type: "string" },
              series: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    seriesName: { type: "string" },
                    value: { type: "number" },
                  },
                  required: ["seriesName", "value"],
                },
              },
            },
            required: ["xAxisLabel", "series"],
          },
        },
      },
      required: ["title", "data"],
    },
  },
];

/**
 * Slice F — saveClaimsToPassport.
 * Has real execute logic: calls /api/passport/describe via internalApiFetch.
 * createPassport and verifyClaim are descoped (Sprint 5 and architecturally prohibited).
 */
export const VOICE_TOOLS_SLICE_F: VoiceRealtimeFunctionDef[] = [
  {
    type: "function",
    name: DefaultToolName.SaveClaimsToPassport,
    description:
      "Save extracted claims to a passport. Call after extractClaimsPreview " +
      "when the user confirms they want to save their claims. " +
      "pending_batch_id is required — get it from the extractClaimsPreview result. " +
      "If passport_id is omitted and title is provided, a new passport is created. " +
      "passport_id must be a UUID from listPassports — never use the passport name.",
    parameters: {
      type: "object",
      properties: {
        pending_batch_id: {
          type: "string",
          description: "Required UUID from the extractClaimsPreview result.",
        },
        passport_id: {
          type: "string",
          description:
            "UUID of existing passport to save to. Omit to create a new passport.",
        },
        title: {
          type: "string",
          description:
            "Name for a new passport. Required when passport_id is omitted.",
        },
        project_name: {
          type: "string",
          description: "Short trial or product name (optional).",
        },
      },
      required: ["pending_batch_id"],
    },
  },
];

/** All passport voice default tools (slices A–E2 + F) registered when the env gate is on. */
export const VOICE_VOICE_DEFAULT_PASSPORT_TOOLS: VoiceRealtimeFunctionDef[] = [
  ...VOICE_TOOLS_SLICE_A,
  ...VOICE_TOOLS_SLICE_B,
  ...VOICE_TOOLS_SLICE_C,
  ...VOICE_TOOLS_SLICE_D,
  ...VOICE_TOOLS_SLICE_E1,
  ...VOICE_TOOLS_SLICE_E2,
  ...VOICE_TOOLS_SLICE_F,
];

export const voiceDefaultToolNamesAllowlist = new Set(
  VOICE_VOICE_DEFAULT_PASSPORT_TOOLS.map((t) => t.name),
);
