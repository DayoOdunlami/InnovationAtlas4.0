import { tool as createTool } from "ai";
import { z } from "zod";
import { internalApiFetch } from "@/lib/passport/internal-fetch";
import { keywordSimilarityTexts } from "@/lib/passport/claim-conflict";
import { getPassportPool } from "@/lib/passport/db";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

type ClaimMatchRow = {
  id: string;
  claim_text: string;
  conditions: string | null;
  source_excerpt: string;
  claim_domain: string;
  confidence_tier: string;
  emb_sim: number | null;
};

export type ClaimDescriptionMatch = {
  claim_id: string;
  claim_text: string;
  conditions: string | null;
  source_excerpt: string;
  claim_domain: string;
  confidence_tier: string;
  relevance: number;
  relevance_method: "embedding" | "keyword";
};

export type RejectClaimByDescriptionOutput =
  | {
      mode: "search_results";
      passport_id: string;
      passport_title: string;
      matches: ClaimDescriptionMatch[];
      instructions: string;
    }
  | {
      mode: "rejected";
      passport_id: string;
      passport_title: string;
      claim_id: string;
      confirmation_message: string;
    };

/**
 * Search uses direct DB reads (fine for MCP-read-only architecture).
 * Reject action routes through POST /api/passport/verify-claim via internalApiFetch.
 */
export const rejectClaimByDescriptionTool = createTool({
  description:
    "Find and reject a claim on a passport by conversational description. " +
    "First call with passport_id + search_description: returns ranked matches. " +
    "If one match, show claim_text, conditions, source_excerpt and ask Yes/No. " +
    "If several, ask which. NEVER reject until the user explicitly confirms. " +
    "Second call with claim_id + user_confirmed_reject=true to reject (same behaviour as " +
    "POST /api/passport/verify-claim action reject). " +
    "Then confirm: '✓ Claim removed from [passport name].'",
  inputSchema: z
    .object({
      passport_id: z.string().uuid(),
      search_description: z
        .string()
        .min(2)
        .optional()
        .describe("Topic or wording to find in claim_text"),
      claim_id: z.string().uuid().optional(),
      user_confirmed_reject: z
        .boolean()
        .optional()
        .describe("Must be true to perform reject after user says yes"),
    })
    .refine(
      (o) =>
        (Boolean(o.search_description) && !o.claim_id) ||
        (Boolean(o.claim_id) && o.user_confirmed_reject === true),
      {
        message:
          "Either provide search_description (search), or claim_id with user_confirmed_reject=true",
      },
    ),
  execute: async ({
    passport_id,
    search_description,
    claim_id,
    user_confirmed_reject,
  }): Promise<RejectClaimByDescriptionOutput> => {
    const pool = getPassportPool();

    try {
      const pRow = await pool.query<{ title: string }>(
        `SELECT COALESCE(title, project_name, 'Untitled') AS title FROM atlas.passports WHERE id = $1`,
        [passport_id],
      );
      if (!pRow.rows[0]) {
        throw new Error(`passport_id ${passport_id} not found`);
      }
      const passportTitle = pRow.rows[0].title;

      // ── Reject path: call /api/passport/verify-claim via internalApiFetch ──
      if (claim_id && user_confirmed_reject) {
        // Verify the claim exists and belongs to this passport (read — fine)
        const check = await pool.query<{ id: string }>(
          `SELECT id FROM atlas.passport_claims
           WHERE id = $1 AND passport_id = $2 AND rejected = false`,
          [claim_id, passport_id],
        );
        if (!check.rows[0]) {
          throw new Error(
            "Claim not found, already rejected, or wrong passport",
          );
        }

        // Write goes through the API route
        await internalApiFetch("/api/passport/verify-claim", {
          claim_id,
          action: "reject",
        });

        return {
          mode: "rejected",
          passport_id,
          passport_title: passportTitle,
          claim_id,
          confirmation_message: `✓ Claim removed from ${passportTitle}.`,
        };
      }

      // ── Search path: reads only ────────────────────────────────────────────
      const desc = search_description ?? "";
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: desc,
      });
      const vectorStr = `[${embedding.join(",")}]`;

      const withEmb = await pool.query<ClaimMatchRow>(
        `SELECT id, claim_text, conditions, source_excerpt, claim_domain, confidence_tier,
                (1 - (embedding <=> $1::vector))::float AS emb_sim
         FROM atlas.passport_claims
         WHERE passport_id = $2 AND rejected = false AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 25`,
        [vectorStr, passport_id],
      );

      const noEmb = await pool.query<ClaimMatchRow>(
        `SELECT id, claim_text, conditions, source_excerpt, claim_domain, confidence_tier,
                NULL::float AS emb_sim
         FROM atlas.passport_claims
         WHERE passport_id = $1 AND rejected = false AND embedding IS NULL`,
        [passport_id],
      );

      const matches: ClaimDescriptionMatch[] = [];

      for (const row of withEmb.rows) {
        const sim = row.emb_sim ?? 0;
        if (sim < 0.25) continue;
        matches.push({
          claim_id: row.id,
          claim_text: row.claim_text,
          conditions: row.conditions,
          source_excerpt: row.source_excerpt,
          claim_domain: row.claim_domain,
          confidence_tier: row.confidence_tier,
          relevance: sim,
          relevance_method: "embedding",
        });
      }

      for (const row of noEmb.rows) {
        const kw = keywordSimilarityTexts(desc, row.claim_text);
        if (kw < 0.2) continue;
        matches.push({
          claim_id: row.id,
          claim_text: row.claim_text,
          conditions: row.conditions,
          source_excerpt: row.source_excerpt,
          claim_domain: row.claim_domain,
          confidence_tier: row.confidence_tier,
          relevance: kw,
          relevance_method: "keyword",
        });
      }

      matches.sort((a, b) => b.relevance - a.relevance);
      const top = matches.slice(0, 8);

      return {
        mode: "search_results",
        passport_id,
        passport_title: passportTitle,
        matches: top,
        instructions:
          top.length === 0
            ? "No claims matched. Ask the user to rephrase or open /passport/[id]."
            : top.length === 1
              ? "One match: show claim_text, conditions, and source_excerpt; ask if this is the claim to remove (Yes/No). On Yes, call again with claim_id and user_confirmed_reject=true."
              : "Several matches: list them and ask which claim_id to remove. On confirmation, call again with claim_id and user_confirmed_reject=true.",
      };
    } finally {
      await pool.end();
    }
  },
});
