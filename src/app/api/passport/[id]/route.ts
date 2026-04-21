import { NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { getPassportDetail } from "@/lib/passport/queries";

// ---------------------------------------------------------------------------
// GET /api/passport/[id]
//
// Thin read wrapper over `getPassportDetail` so client surfaces (the
// canvas passport stage, future passport previews) can fetch the same
// shape the server-rendered /passport/[id] page uses. Auth-gated.
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const detail = await getPassportDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
