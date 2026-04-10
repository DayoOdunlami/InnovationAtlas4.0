import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import { extractText } from "@/lib/passport/text-extractor";
import {
  extractClaimsFromDocument,
  extractClaimsFromDescription,
} from "@/lib/passport/claim-extractor";
import {
  getPassportPool,
  saveClaims,
  markDocumentComplete,
  markDocumentFailed,
} from "@/lib/passport/db";

/**
 * POST /api/passport/extract
 *
 * Path A — file upload (PDF, DOCX, TXT, XLSX, CSV):
 *   { passport_id, document_id, storage_path }
 *   Downloads from Supabase Storage, extracts text, calls Claude,
 *   writes ai_inferred claims to atlas.passport_claims.
 *
 * Path B — typed/spoken description:
 *   { passport_id, text }
 *   Extracts claims from conversation text,
 *   writes self_reported claims (source_document_id = null).
 *
 * Server-side guard: any attempt to write confidence_tier = 'verified' → 400.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    passport_id: string;
    // Path A
    document_id?: string;
    storage_path?: string;
    // Path B
    text?: string;
  };

  const { passport_id } = body;
  if (!passport_id) {
    return NextResponse.json(
      { error: "passport_id is required" },
      { status: 400 },
    );
  }

  const isPathA = Boolean(body.document_id && body.storage_path);
  const isPathB = Boolean(body.text);

  if (!isPathA && !isPathB) {
    return NextResponse.json(
      {
        error:
          "Provide either {document_id, storage_path} (Path A) or {text} (Path B)",
      },
      { status: 400 },
    );
  }

  const pool = getPassportPool();

  try {
    if (isPathA) {
      return await handlePathA(
        pool,
        passport_id,
        body.document_id!,
        body.storage_path!,
      );
    } else {
      return await handlePathB(pool, passport_id, body.text!);
    }
  } finally {
    await pool.end();
  }
}

// ─── Path A: file document ───────────────────────────────────────────────────

async function handlePathA(
  pool: ReturnType<typeof getPassportPool>,
  passportId: string,
  documentId: string,
  storagePath: string,
) {
  const supabase = createAdminClient();

  // Mark as processing
  await pool.query(
    `UPDATE atlas.passport_documents SET processing_status = 'processing' WHERE id = $1`,
    [documentId],
  );

  try {
    // Download file from Supabase Storage
    const { data, error: dlError } = await supabase.storage
      .from("passport-documents")
      .download(storagePath);

    if (dlError || !data) {
      await markDocumentFailed(
        pool,
        documentId,
        dlError?.message ?? "download failed",
      );
      return NextResponse.json(
        { error: `Storage download failed: ${dlError?.message}` },
        { status: 500 },
      );
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = storagePath.split("/").pop() ?? "document";
    const mimeType = data.type || guessMimeType(filename);

    // Extract text
    const extracted = await extractText(buffer, mimeType, filename);

    if (!extracted.text.trim()) {
      await markDocumentFailed(pool, documentId, "No text could be extracted");
      return NextResponse.json(
        { error: "Document appears to be empty or unreadable" },
        { status: 422 },
      );
    }

    // Extract claims via Claude
    const claims = await extractClaimsFromDocument(extracted.text, filename);

    // Confidence ceiling guard — extra server-side check before any DB write
    const violatingClaim = claims.find((c) => c.confidence_tier === "verified");
    if (violatingClaim) {
      return NextResponse.json(
        {
          error:
            "CONFIDENCE CEILING VIOLATION: AI layer returned confidence_tier = 'verified'. " +
            "This is not permitted. Only /api/passport/verify-claim can set 'verified'.",
        },
        { status: 400 },
      );
    }

    // Save claims
    const saved = await saveClaims(pool, passportId, claims, documentId);
    await markDocumentComplete(pool, documentId, saved.length);

    return NextResponse.json({
      path: "A",
      passport_id: passportId,
      document_id: documentId,
      format: extracted.format,
      chars_extracted: extracted.charCount,
      claims_count: saved.length,
      claims: saved,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markDocumentFailed(pool, documentId, message).catch(() => {});
    console.error("[passport/extract Path A]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Path B: typed/spoken description ───────────────────────────────────────

async function handlePathB(
  pool: ReturnType<typeof getPassportPool>,
  passportId: string,
  text: string,
) {
  try {
    const claims = await extractClaimsFromDescription(text);

    // Confidence ceiling guard
    const violatingClaim = claims.find((c) => c.confidence_tier === "verified");
    if (violatingClaim) {
      return NextResponse.json(
        {
          error:
            "CONFIDENCE CEILING VIOLATION: AI layer returned confidence_tier = 'verified'. " +
            "This is not permitted.",
        },
        { status: 400 },
      );
    }

    // Path B: source_document_id = null (no file)
    const saved = await saveClaims(pool, passportId, claims, null);

    return NextResponse.json({
      path: "B",
      passport_id: passportId,
      claims_count: saved.length,
      claims: saved,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[passport/extract Path B]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
