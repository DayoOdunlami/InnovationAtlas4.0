import { getContentTypeFromFilename } from "@/lib/file-storage/storage-utils";
import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "auth/server";
import { NextResponse } from "next/server";
import pg from "pg";

const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 days — model providers fetch this URL

const rawUrl = process.env.POSTGRES_URL!;
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");

function getPool() {
  return new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const threadId = (formData.get("threadId") as string) || "unknown";
    let passportId = formData.get("passportId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const SUPPORTED_TYPES = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
      "text/plain",
    ]);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const SUPPORTED_EXTS = new Set([
      "pdf",
      "docx",
      "xlsx",
      "xls",
      "csv",
      "txt",
      "jpg",
      "jpeg",
      "png",
      "webp",
      "gif",
    ]);

    const isImage =
      Boolean(file.type?.startsWith("image/")) ||
      ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);

    if (
      !isImage &&
      !SUPPORTED_TYPES.has(file.type) &&
      !SUPPORTED_EXTS.has(ext)
    ) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Supported: PDF, DOCX, TXT, XLSX, CSV, and common images.",
        },
        { status: 400 },
      );
    }

    const pool = getPool();

    try {
      // Create a passport if one wasn't provided
      if (!passportId) {
        const result = await pool.query(
          `INSERT INTO atlas.passports (passport_type, title, owner_name)
           VALUES ('evidence_profile', $1, $2)
           RETURNING id`,
          [
            file.name.replace(/\.pdf$/i, ""),
            session.user.name || session.user.email,
          ],
        );
        passportId = result.rows[0].id as string;
      }

      // Upload to Supabase Storage: {threadId}/{passportId}/{filename}
      const storagePath = `${threadId}/${passportId}/${file.name}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uploadContentType =
        file.type ||
        getContentTypeFromFilename(file.name) ||
        "application/octet-stream";

      const { error: storageError } = await supabase.storage
        .from("passport-documents")
        .upload(storagePath, buffer, {
          contentType: uploadContentType,
          upsert: true,
        });

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      const { data: signed, error: signError } = await supabase.storage
        .from("passport-documents")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);

      if (signError || !signed?.signedUrl) {
        throw new Error(
          signError?.message ?? "Could not create signed URL for uploaded file",
        );
      }

      // Create passport_documents row
      const docExt = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const docResult = await pool.query(
        `INSERT INTO atlas.passport_documents
           (passport_id, filename, document_type, storage_path, processing_status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id`,
        [passportId, file.name, docExt, storagePath],
      );
      const documentId = docResult.rows[0].id as string;

      // Documents only: images are for chat attachments / vision — skip extract.
      if (!isImage) {
        const extractUrl = new URL(
          "/api/passport/extract",
          process.env.BETTER_AUTH_URL || "http://localhost:3000",
        );
        fetch(extractUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") ?? "",
          },
          body: JSON.stringify({
            passport_id: passportId,
            document_id: documentId,
            storage_path: storagePath,
          }),
        }).catch((err) =>
          console.error("[passport/upload] Failed to trigger extract:", err),
        );
      }

      return NextResponse.json({
        success: true,
        passportId,
        documentId,
        storagePath,
        filename: file.name,
        url: signed.signedUrl,
        processingStatus: isImage ? "skipped_extract" : "pending",
        message: isImage
          ? "File uploaded."
          : "File uploaded. Claim extraction running in background.",
      });
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error("[passport/upload]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 },
    );
  }
}
