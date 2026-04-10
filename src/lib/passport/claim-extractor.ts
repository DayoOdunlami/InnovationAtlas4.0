import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Schema ─────────────────────────────────────────────────────────────────

export const ClaimRoleSchema = z.enum(["asserts", "requires", "constrains"]);
export const ClaimDomainSchema = z.enum([
  "capability",
  "evidence",
  "certification",
  "performance",
  "regulatory",
]);

/**
 * CONFIDENCE CEILING GUARD — enforced here on every write path.
 * confidence_tier = 'verified' is NEVER allowed from the AI layer.
 * Only /api/passport/verify-claim (Step 8) can set 'verified'.
 */
export const ConfidenceTierSchema = z
  .enum(["ai_inferred", "self_reported", "verified"])
  .refine((v) => v !== "verified", {
    message:
      "CONFIDENCE CEILING VIOLATION: AI layer cannot set confidence_tier = 'verified'. " +
      "Only the HITL verify route can do this.",
  });

export const ExtractedClaimSchema = z.object({
  claim_role: ClaimRoleSchema,
  claim_domain: ClaimDomainSchema,
  claim_text: z.string().min(1),
  conditions: z.string().nullable().optional(),
  confidence_tier: ConfidenceTierSchema,
  confidence_reason: z.string().min(1),
  source_excerpt: z.string().min(1),
});

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

const ClaimListSchema = z.object({
  claims: z.array(ExtractedClaimSchema),
});

// ─── Extraction prompts ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a structured evidence analyst for innovation funding.
Extract structured claims from documents or descriptions of evidence.

For EACH claim output JSON with exactly these fields:
- claim_role: "asserts" | "requires" | "constrains"
- claim_domain: "capability" | "evidence" | "certification" | "performance" | "regulatory"
- claim_text: clear plain-English statement of the claim
- conditions: any limiting conditions (e.g. "valid under 40mph", "GPS-denied only") or null
- confidence_tier: ALWAYS "ai_inferred" for document extraction — NEVER "verified"
- confidence_reason: one sentence explaining why you are uncertain about this claim
- source_excerpt: the EXACT sentence(s) from the source text that this claim was extracted from

RULES:
- Never set confidence_tier = "verified". Use "ai_inferred" for document text, "self_reported" for user-stated descriptions.
- source_excerpt must be verbatim text from the source — never paraphrase it.
- Extract ALL claims, not just the most obvious ones.
- Be conservative: if you are not sure something is a claim, include it with a clear confidence_reason.
- Output ONLY valid JSON matching the schema. No preamble, no markdown fences.`;

// ─── Path A: document extraction ────────────────────────────────────────────

export async function extractClaimsFromDocument(
  documentText: string,
  filename: string,
): Promise<ExtractedClaim[]> {
  const userPrompt = `Extract all structured claims from the following document.
Document: "${filename}"

--- DOCUMENT TEXT START ---
${documentText.slice(0, 80000)}
--- DOCUMENT TEXT END ---

Return JSON: { "claims": [ ...array of claim objects... ] }`;

  return callClaudeForClaims(userPrompt, "ai_inferred");
}

// ─── Path B: self-reported (typed or spoken) ────────────────────────────────

export async function extractClaimsFromDescription(
  description: string,
): Promise<ExtractedClaim[]> {
  const userPrompt = `The user has described their evidence in their own words (typed or spoken).
Extract structured claims from this description.
Since this is self-reported, use confidence_tier = "self_reported" for all claims.

--- USER DESCRIPTION ---
${description.slice(0, 20000)}
--- END ---

Return JSON: { "claims": [ ...array of claim objects... ] }`;

  return callClaudeForClaims(userPrompt, "self_reported");
}

// ─── Shared Claude call ──────────────────────────────────────────────────────

async function callClaudeForClaims(
  userPrompt: string,
  expectedTier: "ai_inferred" | "self_reported",
): Promise<ExtractedClaim[]> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Claude returned unexpected content type");
  }

  let parsed: unknown;
  try {
    // Strip markdown code fences if Claude wraps the JSON
    const raw = content.text
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Failed to parse Claude JSON response: ${content.text.slice(0, 200)}`,
    );
  }

  const result = ClaimListSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Claude response failed schema validation: ${result.error.message}`,
    );
  }

  // Enforce confidence ceiling: override any 'verified' the model may sneak in,
  // and normalise the tier to what the path expects.
  const claims = result.data.claims.map((c) => ({
    ...c,
    // Hard override — AI layer can NEVER produce 'verified'
    confidence_tier:
      c.confidence_tier === "verified"
        ? (expectedTier as "ai_inferred" | "self_reported")
        : c.confidence_tier,
  })) as ExtractedClaim[];

  return claims;
}
