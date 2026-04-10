import { tool as createTool } from "ai";
import { z } from "zod";
import { extractClaimsFromDescription } from "@/lib/passport/claim-extractor";
import { getPassportPool } from "@/lib/passport/db";
import type { ExtractedClaim } from "@/lib/passport/claim-extractor";

export type ClaimsPreviewOutput = {
  pending_batch_id: string;
  claims: ExtractedClaim[];
  source_text_length: number;
};

export const extractClaimsPreviewTool = createTool({
  description:
    "Extract structured claims from a typed or spoken innovation description WITHOUT " +
    "saving them yet. Returns a ClaimPreviewCard so the user can review the claims, " +
    "then choose which passport to save them to. " +
    "After calling this tool, present the user with a numbered list of their passports " +
    "from listPassports and ask which one to save to (or 'new' to create a new passport). " +
    "Then call saveClaimsToPassport with the pending_batch_id.",
  inputSchema: z.object({
    text: z
      .string()
      .min(20)
      .describe(
        "The full description or transcript to extract claims from (Path B)",
      ),
    context_hint: z
      .string()
      .optional()
      .describe(
        "Optional short hint to help Claude focus (e.g. 'autonomous vehicle trial')",
      ),
  }),
  execute: async ({ text, context_hint }): Promise<ClaimsPreviewOutput> => {
    const fullText = context_hint
      ? `Context: ${context_hint}\n\n${text}`
      : text;
    const claims = await extractClaimsFromDescription(fullText);

    // Store in pending_claim_batches so JARVIS doesn't need to re-pass large JSON
    const pool = getPassportPool();
    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO atlas.pending_claim_batches (claims, source_text)
         VALUES ($1::jsonb, $2)
         RETURNING id`,
        [JSON.stringify(claims), text.slice(0, 2000)],
      );
      return {
        pending_batch_id: result.rows[0].id,
        claims,
        source_text_length: text.length,
      };
    } finally {
      await pool.end();
    }
  },
});
