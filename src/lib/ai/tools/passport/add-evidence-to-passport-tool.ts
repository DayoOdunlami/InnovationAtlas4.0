import { tool as createTool } from "ai";
import { z } from "zod";
import { internalApiFetch } from "@/lib/passport/internal-fetch";
import type { ExtractedClaim } from "@/lib/passport/claim-extractor";

const ResolutionSchema = z.enum([
  "kept_both",
  "replaced",
  "flagged_for_review",
  "rejected_new",
]);

export type AddEvidenceConflictRow = {
  incoming_claim_index: number;
  existing_claim_id: string;
  similarity: number;
  similarity_method: "embedding" | "keyword";
  incoming: ExtractedClaim;
  existing: {
    claim_text: string;
    conditions: string | null;
    confidence_tier: string;
    source_excerpt: string;
  };
};

export type AddEvidenceOutput =
  | {
      status: "conflicts_pending";
      passport_id: string;
      passport_title: string;
      pending_batch_id: string;
      conflicts: AddEvidenceConflictRow[];
      instructions: string;
    }
  | {
      status: "saved";
      passport_id: string;
      passport_title: string;
      claims_added: number;
      conflicts_resolved: number;
      passport_url: string;
      confirmation_message: string;
    };

/**
 * Calls POST /api/passport/add-evidence via internalApiFetch.
 * The API route handles conflict detection, embeddings, and DB writes.
 * No direct SQL is performed here.
 */
export const addEvidenceToPassportTool = createTool({
  description:
    "Add new evidence to an EXISTING passport after extractClaimsPreview. " +
    "Flow: user says they have new evidence → listPassports → user picks passport → " +
    "extractClaimsPreview → then call THIS tool with passport_id + pending_batch_id. " +
    "If the tool returns status=conflicts_pending, show each pair side by side (confidence + " +
    "source excerpts) and offer four options: (1) keep both — different conditions " +
    "(2) replace existing with new (3) save new and flag existing for review " +
    "(4) reject new claim. Then call again with the same ids plus conflict_resolutions. " +
    "If status=saved, confirm: '✓ [N] claims added to [passport]. [conflict summary]. " +
    "Matching will update your scores shortly.' and call runMatching(passport_id). " +
    "Do not use saveClaimsToPassport for this flow — use this tool so conflicts are checked.",
  inputSchema: z.object({
    passport_id: z.string().uuid(),
    pending_batch_id: z.string().uuid(),
    conflict_resolutions: z
      .array(
        z.object({
          incoming_claim_index: z.number().int().min(0),
          existing_claim_id: z.string().uuid(),
          resolution: ResolutionSchema,
        }),
      )
      .optional()
      .describe(
        "Required when continuing after conflicts_pending — one entry per detected conflict",
      ),
  }),
  execute: async ({
    passport_id,
    pending_batch_id,
    conflict_resolutions,
  }): Promise<AddEvidenceOutput> => {
    return internalApiFetch<AddEvidenceOutput>("/api/passport/add-evidence", {
      passport_id,
      pending_batch_id,
      conflict_resolutions,
    });
  },
});
