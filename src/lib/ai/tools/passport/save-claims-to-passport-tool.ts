import { internalApiFetch } from "@/lib/passport/internal-fetch";
import { tool as createTool } from "ai";
import { z } from "zod";

export type SaveClaimsOutput = {
  passport_id: string;
  passport_title: string;
  claims_saved: number;
  passport_url: string;
};

export type SaveClaimsInput = {
  pending_batch_id: string;
  passport_id?: string;
  title?: string;
  project_name?: string;
  tags?: string[];
  trial_date_start?: string;
  trial_date_end?: string;
};

/**
 * Shared runner — used by both the text tool and the voice Realtime dispatcher.
 * Calls POST /api/passport/describe via internalApiFetch.
 * The API route handles all DB writes with proper confidence ceiling guards.
 */
export async function runSaveClaimsToPassportRunner(
  args: SaveClaimsInput,
): Promise<SaveClaimsOutput> {
  const result = await internalApiFetch<{
    passport_id: string;
    passport_title: string;
    claims_saved: number;
  }>("/api/passport/describe", args);
  return {
    passport_id: result.passport_id,
    passport_title: result.passport_title,
    claims_saved: result.claims_saved,
    passport_url: `/passport/${result.passport_id}`,
  };
}

/**
 * Calls POST /api/passport/describe via internalApiFetch.
 * The API route handles all DB writes with proper confidence ceiling guards.
 * No direct SQL is performed here.
 */
export const saveClaimsToPassportTool = createTool({
  description:
    "Save a pending batch of extracted claims to a chosen passport. " +
    "Use the pending_batch_id returned by extractClaimsPreview. " +
    "For adding evidence to an EXISTING passport (returning user), use addEvidenceToPassport instead " +
    "so conflicts are detected before save. " +
    "If the user said 'new', omit passport_id and provide title (and optionally " +
    "project_name, tags, trial_date_start, trial_date_end). " +
    "After saving, confirm: '✓ N claims saved to [title]. Visit /passport/[id] to review and verify them.'",
  inputSchema: z.object({
    pending_batch_id: z
      .string()
      .uuid()
      .describe("UUID from extractClaimsPreview output"),
    passport_id: z
      .string()
      .uuid()
      .optional()
      .describe("Existing passport UUID. Omit to create a new passport."),
    title: z
      .string()
      .optional()
      .describe("Title for new passport (required if no passport_id)"),
    project_name: z.string().optional().describe("Short trial or product name"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tag labels, e.g. ['autonomy', 'rail']"),
    trial_date_start: z
      .string()
      .optional()
      .describe("ISO date string, e.g. 2024-01-15"),
    trial_date_end: z.string().optional().describe("ISO date string"),
  }),
  execute: async (args): Promise<SaveClaimsOutput> =>
    runSaveClaimsToPassportRunner(args),
});
