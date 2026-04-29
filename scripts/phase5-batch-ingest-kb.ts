#!/usr/bin/env tsx
import "load-env";
import pg from "pg";
import {
  findKnowledgeDocumentIdByTitle,
  ingestKnowledgeDocumentById,
} from "@/lib/kb/ingest-knowledge-document";

const TITLES_IN_ORDER = [
  // DOCX first (fail fast per phase gate)
  "Innovation Passports Second Level Plan v2",
  // Remaining PDFs
  "Network Rail GB CP7 Delivery Plan — Year 2 update",
  "UK Jet Zero Strategy: Delivering Net Zero Aviation by 2050",
  "ATI Destination Zero: The Technology Journey to 2050",
  "Maritime 2050: Navigating the Future",
  "Road Investment Strategy 3 (RIS3): 2026-2031",
  "Automated Vehicles Act 2024",
  "UK Transport Decarbonisation Plan: Decarbonising Transport — A Better, Greener Britain",
  "UK Hydrogen Strategy",
] as const;

type Result = {
  title: string;
  success: boolean;
  chunkCount?: number;
  format?: string;
  charCount?: number;
  error?: string;
};

async function verifyCounts(titles: readonly string[]) {
  const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("POSTGRES_URL or DATABASE_URL is required");
  const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const res = await client.query<{
      title: string;
      chunks: number;
      with_embedding: number;
      status: string;
    }>(
      `
      SELECT d.title,
             COUNT(c.id)::int AS chunks,
             COUNT(c.id) FILTER (WHERE c.embedding IS NOT NULL)::int AS with_embedding,
             d.status
      FROM atlas.knowledge_documents d
      LEFT JOIN atlas.knowledge_chunks c ON c.document_id = d.id
      WHERE d.title = ANY($1::text[])
      GROUP BY d.id, d.title, d.status
      ORDER BY d.title
      `,
      [titles],
    );
    return res.rows;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const results: Result[] = [];

  for (let i = 0; i < TITLES_IN_ORDER.length; i++) {
    const title = TITLES_IN_ORDER[i];
    const id = await findKnowledgeDocumentIdByTitle(title);
    if (!id) {
      const msg = `Document not found: ${title}`;
      results.push({ title, success: false, error: msg });
      throw new Error(msg);
    }

    console.log(`Ingesting (${i + 1}/${TITLES_IN_ORDER.length}): ${title}`);
    try {
      const out = await ingestKnowledgeDocumentById(id);
      results.push({
        title,
        success: true,
        chunkCount: out.chunkCount,
        format: out.format,
        charCount: out.charCount,
      });
      console.log(
        `  ✓ chunks=${out.chunkCount} format=${out.format} chars=${out.charCount}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ title, success: false, error: msg });
      console.error(`  ✗ ${msg}`);
      // Per phase instruction: stop immediately if DOCX first run fails.
      throw new Error(`Batch stopped on "${title}": ${msg}`);
    }
  }

  const counts = await verifyCounts(TITLES_IN_ORDER);
  console.log("\n--- Phase 5 verification counts ---");
  for (const row of counts) {
    console.log(
      `${row.title} | status=${row.status} | chunks=${row.chunks} | embedded=${row.with_embedding}`,
    );
  }

  console.log("\n--- Phase 5 ingest summary ---");
  for (const r of results) {
    if (r.success) {
      console.log(
        `✓ ${r.title} | chunks=${r.chunkCount} | format=${r.format} | chars=${r.charCount}`,
      );
    } else {
      console.log(`✗ ${r.title} | ${r.error}`);
    }
  }
}

void main();
