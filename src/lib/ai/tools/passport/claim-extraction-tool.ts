import { getPassportPool } from "@/lib/passport/db";
import { tool as createTool } from "ai";
import { z } from "zod";

export type ClaimRow = {
  id: string;
  claim_role: "asserts" | "requires" | "constrains";
  claim_domain:
    | "capability"
    | "evidence"
    | "certification"
    | "performance"
    | "regulatory";
  claim_text: string;
  conditions: string | null;
  confidence_tier: "ai_inferred" | "self_reported" | "verified";
  confidence_reason: string;
  source_excerpt: string;
  source_document_id: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejected: boolean;
  user_note: string | null;
};

export type ClaimExtractionOutput = {
  passport_id: string;
  claims: ClaimRow[];
};

export const showClaimExtractionInputSchema = z.object({
  passport_id: z.string().describe("UUID of the passport to show claims for"),
  document_id: z
    .string()
    .optional()
    .describe("Optional: filter claims to a specific document"),
});

/** Shared by text chat tool and voice Realtime dispatcher. */
export async function runShowClaimExtraction(input: {
  passport_id: string;
  document_id?: string;
}): Promise<ClaimExtractionOutput> {
  const { passport_id, document_id } =
    showClaimExtractionInputSchema.parse(input);
  const pool = getPassportPool();
  try {
    const result = await pool.query(
      `SELECT id, claim_role, claim_domain, claim_text, conditions,
              confidence_tier, confidence_reason, source_excerpt,
              source_document_id, verified_at, verified_by,
              rejected, user_note
       FROM atlas.passport_claims
       WHERE passport_id = $1
         AND rejected = false
         ${document_id ? "AND source_document_id = $2" : ""}
       ORDER BY claim_domain, confidence_tier`,
      document_id ? [passport_id, document_id] : [passport_id],
    );
    return { passport_id, claims: result.rows as ClaimRow[] };
  } finally {
    await pool.end();
  }
}

export const showClaimExtractionTool = createTool({
  description:
    "Display a structured ClaimExtractionCard showing all extracted claims for a passport. " +
    "Shows confidence tier (ai_inferred = amber, self_reported = blue, verified = green), " +
    "source_excerpt, confidence_reason, and Verify/Reject buttons per claim.",
  inputSchema: showClaimExtractionInputSchema,
  execute: async ({
    passport_id,
    document_id,
  }): Promise<ClaimExtractionOutput> =>
    runShowClaimExtraction({ passport_id, document_id }),
});
