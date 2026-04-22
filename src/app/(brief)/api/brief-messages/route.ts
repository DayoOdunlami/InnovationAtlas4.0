// ---------------------------------------------------------------------------
// POST /api/brief-messages — persistence endpoint for the Phase 1 brief
// chat shell.
//
// The BriefChatShell component calls this endpoint every time a user or
// assistant message settles. Writes go through the `AccessScope`-aware
// message repository so the ownership check happens once, inside the
// repository boundary. Share-scope callers are rejected (share readers
// cannot append — Data Model Spec §13 Q1).
// ---------------------------------------------------------------------------

import { pgMessageRepository } from "@/lib/db/pg/repositories/message-repository.pg";
import { AccessDeniedError } from "@/lib/db/pg/repositories/access-scope";
import { getSession } from "lib/auth/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  briefId: z.string().uuid(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  contentJson: z.unknown(),
  toolCalls: z.unknown().optional(),
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
    const row = await pgMessageRepository.appendMessage(
      parsed.data.briefId,
      {
        role: parsed.data.role,
        contentJson: parsed.data.contentJson,
        ...(parsed.data.toolCalls !== undefined
          ? { toolCalls: parsed.data.toolCalls }
          : {}),
      },
      { kind: "user", userId: session.user.id },
    );
    return NextResponse.json({ id: row.id, createdAt: row.createdAt });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[brief-messages] appendMessage failed:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
