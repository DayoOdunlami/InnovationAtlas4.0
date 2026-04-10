import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import pg from "pg";

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

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
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

      const { error: storageError } = await supabase.storage
        .from("passport-documents")
        .upload(storagePath, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      // Create passport_documents row
      const docResult = await pool.query(
        `INSERT INTO atlas.passport_documents
           (passport_id, filename, document_type, storage_path, processing_status)
         VALUES ($1, $2, 'pdf', $3, 'pending')
         RETURNING id`,
        [passportId, file.name, storagePath],
      );
      const documentId = docResult.rows[0].id as string;

      return NextResponse.json({
        success: true,
        passportId,
        documentId,
        storagePath,
        filename: file.name,
        processingStatus: "pending",
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
