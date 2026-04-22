// ---------------------------------------------------------------------------
// POST /api/brief-blocks — owner-scoped block creation (Phase 2a.0).
//
// Minimal counterpart to `/api/brief-messages`. 2a.0 has no user
// authoring UX so this endpoint exists for (a) tests and (b) future
// client-driven authoring flows (2a.1 per-type append tools will
// layer on top). Share-scope callers are rejected inside the
// repository — share readers cannot create blocks.
//
// The body is validated with zod; invalid input returns 400. Access
// denial returns 403. A successful create returns the row.
// ---------------------------------------------------------------------------

import { pgBlockRepository } from "@/lib/db/pg/repositories/block-repository.pg";
import { AccessDeniedError } from "@/lib/db/pg/repositories/access-scope";
import { getSession } from "lib/auth/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "bullets",
  "citation",
  "project-card",
  "chart",
  "live-passport-view",
  "landscape-embed",
  "table",
] as const;

const bodySchema = z.object({
  briefId: z.string().uuid(),
  type: z.enum(BLOCK_TYPES),
  position: z.string().optional(),
  contentJson: z.unknown(),
  source: z.enum(["user", "agent"]).default("user"),
  id: z.string().length(26).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const row = await pgBlockRepository.create(parsed.data, {
      kind: "user",
      userId: session.user.id,
    });
    return NextResponse.json({ block: row });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
