import "load-env";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/passport/claim-extractor", () => ({
  extractClaimsFromDescription: vi.fn(async () => [
    {
      claim_role: "asserts",
      claim_domain: "capability",
      claim_text:
        "Autonomous shuttle deployed in March 2024 for depot logistics trials with CPC.",
      conditions: null,
      confidence_tier: "ai_inferred",
      confidence_reason:
        "Synthetic smoke payload; extractor mocked for Vitest.",
      source_excerpt:
        "Autonomous shuttle deployed in March 2024 for depot logistics trials with CPC.",
    },
  ]),
}));

import { getPassportPool } from "@/lib/passport/db";

import { hasRealPostgresUrl } from "@/test-utils/postgres-env";

function smokesReady() {
  return hasRealPostgresUrl() && Boolean(process.env.BETTER_AUTH_SECRET);
}

describe.skipIf(!smokesReady())("Atlas passport smoke", () => {
  const secret = process.env.BETTER_AUTH_SECRET as string;
  const t = 30_000;

  it(
    "rejects confidence_tier verified on /api/passport/describe and does not add verified rows",
    async () => {
      const pool = getPassportPool();
      try {
        const countRes = await pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM atlas.passport_claims WHERE confidence_tier = 'verified'`,
        );
        const verifiedBefore = Number(countRes.rows[0].n);

        const { POST } = await import("@/app/api/passport/describe/route");
        const res = await POST(
          new Request("http://localhost/api/passport/describe", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-tool-secret": secret,
            },
            body: JSON.stringify({
              title: "Smoke verified rejection",
              claims: [
                {
                  claim_role: "asserts",
                  claim_domain: "capability",
                  claim_text: "Illegal verified tier claim for smoke test.",
                  conditions: null,
                  confidence_tier: "verified",
                  confidence_reason: "should not persist",
                  source_excerpt: "Illegal verified tier claim for smoke test.",
                },
              ],
            }),
          }),
        );

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toMatch(/CONFIDENCE CEILING/i);

        const countAfter = await pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM atlas.passport_claims WHERE confidence_tier = 'verified'`,
        );
        expect(Number(countAfter.rows[0].n)).toBe(verifiedBefore);
      } finally {
        await pool.end();
      }
    },
    t,
  );

  it(
    "binds a non-empty passport APP_DEFAULT tool kit (JARVIS /api/chat tool path)",
    async () => {
      const { APP_DEFAULT_TOOL_KIT } = await import("@/lib/ai/tools/tool-kit");
      const { AppDefaultToolkit } = await import("@/lib/ai/tools");
      const passportTools = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Passport];
      expect(Object.keys(passportTools).length).toBeGreaterThan(0);
    },
    t,
  );

  it(
    "POST /api/passport/preview returns JSON with pending_batch_id and claims",
    async () => {
      const { POST: previewPost } = await import(
        "@/app/api/passport/preview/route"
      );
      const res = await previewPost(
        new Request("http://localhost/api/passport/preview", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tool-secret": secret,
          },
          body: JSON.stringify({
            text: "aaaaaaaaaaaaaaaaaaaa",
            context_hint: "Vitest smoke fixture for preview route.",
          }),
        }),
      );

      const ct = res.headers.get("content-type") ?? "";
      expect(ct).toMatch(/application\/json/i);
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        pending_batch_id?: string;
        claims?: unknown[];
      };
      expect(typeof json.pending_batch_id).toBe("string");
      expect((json.pending_batch_id as string).length).toBeGreaterThan(0);
      expect(Array.isArray(json.claims)).toBe(true);
      expect((json.claims as unknown[]).length).toBeGreaterThan(0);

      const pool = getPassportPool();
      try {
        await pool.query(
          `DELETE FROM atlas.pending_claim_batches WHERE id = $1`,
          [json.pending_batch_id],
        );
      } finally {
        await pool.end();
      }
    },
    t,
  );

  it(
    "POST /api/passport/describe persists claims from a pending batch",
    async () => {
      const pool = getPassportPool();
      let passportId: string | null = null;
      const batchId = randomUUID();
      try {
        const before = await pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM atlas.passport_claims`,
        );
        const nBefore = Number(before.rows[0].n);

        const claims = [
          {
            claim_role: "asserts",
            claim_domain: "performance",
            claim_text: "Smoke run completed sub-100ms latency on test track.",
            conditions: null,
            confidence_tier: "self_reported",
            confidence_reason: "Fixture for Vitest smoke describe persistence.",
            source_excerpt:
              "Smoke run completed sub-100ms latency on test track.",
          },
        ];
        await pool.query(
          `INSERT INTO atlas.pending_claim_batches (id, claims, source_text) VALUES ($1, $2::jsonb, $3)`,
          [batchId, JSON.stringify(claims), "smoke source"],
        );

        const { POST } = await import("@/app/api/passport/describe/route");
        const res = await POST(
          new Request("http://localhost/api/passport/describe", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-tool-secret": secret,
            },
            body: JSON.stringify({
              pending_batch_id: batchId,
              title: `Smoke describe ${batchId.slice(0, 8)}`,
            }),
          }),
        );

        expect(res.status).toBe(200);
        const out = (await res.json()) as {
          passport_id: string;
          claims_saved: number;
        };
        expect(out.claims_saved).toBe(1);
        passportId = out.passport_id;

        const after = await pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM atlas.passport_claims`,
        );
        expect(Number(after.rows[0].n)).toBe(nBefore + 1);

        const batchGone = await pool.query(
          `SELECT 1 FROM atlas.pending_claim_batches WHERE id = $1`,
          [batchId],
        );
        expect(batchGone.rows.length).toBe(0);
      } finally {
        if (passportId) {
          await pool.query(
            `DELETE FROM atlas.passport_claims WHERE passport_id = $1`,
            [passportId],
          );
          await pool.query(`DELETE FROM atlas.passports WHERE id = $1`, [
            passportId,
          ]);
        } else {
          await pool.query(
            `DELETE FROM atlas.pending_claim_batches WHERE id = $1`,
            [batchId],
          );
        }
        await pool.end();
      }
    },
    t,
  );
});
