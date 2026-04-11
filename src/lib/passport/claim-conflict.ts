import "server-only";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import type { Pool } from "pg";
import type { ExtractedClaim } from "./claim-extractor";

export type ExistingClaimForConflict = {
  id: string;
  claim_text: string;
  conditions: string | null;
  claim_domain: string;
  confidence_tier: string;
  source_excerpt: string;
  created_at: string;
};

export type ClaimConflictCandidate = {
  incoming_claim_index: number;
  incoming: ExtractedClaim;
  existing_claim_id: string;
  existing: ExistingClaimForConflict;
  similarity: number;
  similarity_method: "embedding" | "keyword";
};

const NEG_RE =
  /\b(no|not|never|without|lack|doesn't|don't|didn't|cannot|can't)\b/i;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function keywordSimilarityTexts(a: string, b: string): number {
  return jaccard(tokenize(a), tokenize(b));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map(Number).filter((n) => !Number.isNaN(n));
}

function numbersContradict(a: string, b: string): boolean {
  const na = extractNumbers(a);
  const nb = extractNumbers(b);
  if (na.length === 0 || nb.length === 0) return false;
  for (const x of na) {
    for (const y of nb) {
      if (x === 0 || y === 0) continue;
      const ratio = Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y));
      if (ratio > 0.15 && Math.abs(x - y) > 1) return true;
    }
  }
  return false;
}

function negationMismatch(a: string, b: string): boolean {
  const na = NEG_RE.test(a);
  const nb = NEG_RE.test(b);
  if (na === nb) return false;
  return jaccard(tokenize(a), tokenize(b)) > 0.25;
}

export function buildEmbedPayload(claim: ExtractedClaim): string {
  return `[${claim.claim_role} / ${claim.claim_domain}] ${claim.claim_text}${
    claim.conditions ? ` | conditions: ${claim.conditions}` : ""
  }`;
}

export function buildEmbedPayloadFromExisting(
  row: ExistingClaimForConflict,
): string {
  return `[${row.claim_domain}] ${row.claim_text}${
    row.conditions ? ` | conditions: ${row.conditions}` : ""
  }`;
}

/**
 * High embedding similarity but materially different wording / conditions / numbers
 * → treat as potential contradiction (user resolves in chat).
 */
export function appearsContradictory(
  incoming: ExtractedClaim,
  existing: ExistingClaimForConflict,
  similarity: number,
): boolean {
  if (similarity <= 0.85) return false;

  const inc = incoming.claim_text;
  const exc = existing.claim_text;
  const tj = jaccard(tokenize(inc), tokenize(exc));

  if (similarity > 0.93 && tj > 0.92) return false;

  if (numbersContradict(inc, exc)) return true;
  if (negationMismatch(inc, exc)) return true;

  const c1 = (incoming.conditions ?? "").trim().toLowerCase();
  const c2 = (existing.conditions ?? "").trim().toLowerCase();
  if (c1 && c2 && jaccard(tokenize(c1), tokenize(c2)) < 0.45 && tj > 0.45) {
    return true;
  }

  if (similarity > 0.85 && tj < 0.88) return true;

  return similarity > 0.9 && tj < 0.9;
}

async function embedClaimText(value: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value,
  });
  return embedding;
}

/**
 * Detect incoming claims that likely contradict existing passport claims (same domain).
 */
export async function detectPassportClaimConflicts(
  pool: Pool,
  passportId: string,
  incoming: ExtractedClaim[],
): Promise<ClaimConflictCandidate[]> {
  const conflicts: ClaimConflictCandidate[] = [];

  const noEmb = await pool.query<ExistingClaimForConflict>(
    `SELECT id, claim_text, conditions, claim_domain, confidence_tier,
            source_excerpt, created_at::text AS created_at
     FROM atlas.passport_claims
     WHERE passport_id = $1 AND rejected = false AND embedding IS NULL`,
    [passportId],
  );

  for (let i = 0; i < incoming.length; i++) {
    const claim = incoming[i];
    const vector = await embedClaimText(buildEmbedPayload(claim));
    const vectorStr = `[${vector.join(",")}]`;

    const withEmb = await pool.query<
      ExistingClaimForConflict & { emb_sim: number }
    >(
      `SELECT id, claim_text, conditions, claim_domain, confidence_tier,
              source_excerpt, created_at::text AS created_at,
              (1 - (embedding <=> $1::vector))::float AS emb_sim
       FROM atlas.passport_claims
       WHERE passport_id = $2 AND rejected = false
         AND claim_domain = $3
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 5`,
      [vectorStr, passportId, claim.claim_domain],
    );

    let best: ClaimConflictCandidate | null = null;

    for (const row of withEmb.rows) {
      if (
        row.emb_sim > 0.85 &&
        appearsContradictory(claim, row, row.emb_sim) &&
        (!best || row.emb_sim > best.similarity)
      ) {
        best = {
          incoming_claim_index: i,
          incoming: claim,
          existing_claim_id: row.id,
          existing: row,
          similarity: row.emb_sim,
          similarity_method: "embedding",
        };
      }
    }

    const domainNoEmb = noEmb.rows.filter(
      (r) => r.claim_domain === claim.claim_domain,
    );
    const incTokens = tokenize(buildEmbedPayload(claim));
    for (const row of domainNoEmb) {
      const kw = jaccard(
        incTokens,
        tokenize(buildEmbedPayloadFromExisting(row)),
      );
      if (
        kw > 0.85 &&
        appearsContradictory(claim, row, kw) &&
        (!best || kw > best.similarity)
      ) {
        best = {
          incoming_claim_index: i,
          incoming: claim,
          existing_claim_id: row.id,
          existing: row,
          similarity: kw,
          similarity_method: "keyword",
        };
      }
    }

    if (best) conflicts.push(best);
  }

  return conflicts;
}
