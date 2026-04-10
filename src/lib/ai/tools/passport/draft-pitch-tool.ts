import { tool as createTool } from "ai";
import { z } from "zod";

export const createDraftPitchTool = createTool({
  description:
    "Display a DraftPitchCard — a 3-paragraph Statement of Intent suitable for a funding application. " +
    "Includes a copy-to-clipboard button. Call this when the user asks for a draft pitch, " +
    "briefing note, or Statement of Intent.",
  inputSchema: z.object({
    title: z.string().describe("Title of the pitch / funding call"),
    paragraph1: z
      .string()
      .describe(
        "Paragraph 1: what the evidence shows and the innovation claim",
      ),
    paragraph2: z
      .string()
      .describe(
        "Paragraph 2: which funding calls / projects it matches and why",
      ),
    paragraph3: z
      .string()
      .describe(
        "Paragraph 3: what is still needed (gaps) and next steps to close them",
      ),
    passport_id: z
      .string()
      .optional()
      .describe("Optional: the passport UUID this pitch is based on"),
    funder: z
      .string()
      .optional()
      .describe("Optional: the target funder / funding programme"),
    funding_amount: z
      .string()
      .optional()
      .describe("Optional: estimated funding amount eligibility"),
  }),
  execute: async () => "Success",
});
