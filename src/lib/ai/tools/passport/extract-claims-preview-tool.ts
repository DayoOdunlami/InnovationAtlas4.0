import type { ExtractedClaim } from "@/lib/passport/claim-extractor";
import { internalApiFetch } from "@/lib/passport/internal-fetch";
import { tool as createTool } from "ai";
import { z } from "zod";

export type ClaimsPreviewOutput = {
  pending_batch_id: string;
  claims: ExtractedClaim[];
  source_text_length: number;
};

export const extractClaimsPreviewInputSchema = z.object({
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
});

/** Shared by text chat tool and voice Realtime dispatcher. */
export async function runExtractClaimsPreview(input: {
  text: string;
  context_hint?: string;
}): Promise<ClaimsPreviewOutput> {
  const parsed = extractClaimsPreviewInputSchema.parse(input);
  return internalApiFetch<ClaimsPreviewOutput>("/api/passport/preview", {
    text: parsed.text,
    context_hint: parsed.context_hint,
  });
}

/**
 * Calls POST /api/passport/preview via internalApiFetch.
 * The API route handles Claude claim extraction and pending_claim_batches insert.
 * No direct SQL is performed here.
 */
export const extractClaimsPreviewTool = createTool({
  description:
    "Extract structured claims from a typed or spoken innovation description WITHOUT " +
    "saving them yet. Returns a ClaimPreviewCard so the user can review the claims, " +
    "then choose which passport to save them to. " +
    "After calling this tool, present the user with a numbered list of their passports " +
    "from listPassports and ask which one to save to (or 'new' to create a new passport). " +
    "Then call saveClaimsToPassport with the pending_batch_id.",
  inputSchema: extractClaimsPreviewInputSchema,
  execute: async ({ text, context_hint }): Promise<ClaimsPreviewOutput> =>
    runExtractClaimsPreview({ text, context_hint }),
});
