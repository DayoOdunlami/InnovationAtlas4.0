import { tool as createTool } from "ai";
import { z } from "zod";
import { getPassportPool, saveClaims } from "@/lib/passport/db";

export type SaveClaimsOutput = {
  passport_id: string;
  passport_title: string;
  claims_saved: number;
  passport_url: string;
};

export const saveClaimsToPassportTool = createTool({
  description:
    "Save a pending batch of extracted claims to a chosen passport. " +
    "Use the pending_batch_id returned by extractClaimsPreview. " +
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
  execute: async ({
    pending_batch_id,
    passport_id,
    title,
    project_name,
    tags,
    trial_date_start,
    trial_date_end,
  }): Promise<SaveClaimsOutput> => {
    const pool = getPassportPool();
    try {
      // Fetch pending claims
      const batchResult = await pool.query<{ claims: unknown }>(
        `SELECT claims FROM atlas.pending_claim_batches WHERE id = $1`,
        [pending_batch_id],
      );
      if (!batchResult.rows[0]) {
        throw new Error(
          `pending_batch_id ${pending_batch_id} not found or expired`,
        );
      }
      const claims = batchResult.rows[0].claims as Parameters<
        typeof saveClaims
      >[2];

      // Confidence ceiling guard
      if (
        (claims as { confidence_tier?: string }[]).some(
          (c) => c.confidence_tier === "verified",
        )
      ) {
        throw new Error(
          "CONFIDENCE CEILING VIOLATION: cannot write confidence_tier = 'verified'",
        );
      }

      // Delete batch
      await pool.query(
        `DELETE FROM atlas.pending_claim_batches WHERE id = $1`,
        [pending_batch_id],
      );

      let passportId = passport_id ?? "";
      let passportTitle = "";

      if (!passportId) {
        const pTitle = title ?? project_name ?? "Untitled Passport";
        const newP = await pool.query<{ id: string; title: string }>(
          `INSERT INTO atlas.passports
             (title, project_name, tags, trial_date_start, trial_date_end)
           VALUES ($1, $2, $3, $4::date, $5::date)
           RETURNING id, COALESCE(title, project_name, 'Untitled') AS title`,
          [
            pTitle,
            project_name ?? null,
            tags ?? [],
            trial_date_start ?? null,
            trial_date_end ?? null,
          ],
        );
        passportId = newP.rows[0].id;
        passportTitle = newP.rows[0].title;
      } else {
        if (project_name || tags || trial_date_start || trial_date_end) {
          await pool.query(
            `UPDATE atlas.passports
             SET project_name = COALESCE($2, project_name),
                 tags = COALESCE($3, tags),
                 trial_date_start = COALESCE($4::date, trial_date_start),
                 trial_date_end = COALESCE($5::date, trial_date_end),
                 updated_at = now()
             WHERE id = $1`,
            [
              passportId,
              project_name ?? null,
              tags ?? null,
              trial_date_start ?? null,
              trial_date_end ?? null,
            ],
          );
        }
        const pRow = await pool.query<{ title: string }>(
          `SELECT COALESCE(title, project_name, 'Untitled') AS title FROM atlas.passports WHERE id = $1`,
          [passportId],
        );
        passportTitle = pRow.rows[0]?.title ?? "Untitled";
      }

      const saved = await saveClaims(pool, passportId, claims, null);
      await pool.query(
        `UPDATE atlas.passports SET updated_at = now() WHERE id = $1`,
        [passportId],
      );

      return {
        passport_id: passportId,
        passport_title: passportTitle,
        claims_saved: saved.length,
        passport_url: `/passport/${passportId}`,
      };
    } finally {
      await pool.end();
    }
  },
});
