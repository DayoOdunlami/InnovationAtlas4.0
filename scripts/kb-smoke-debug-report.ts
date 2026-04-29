#!/usr/bin/env tsx
import "load-env";
import { writeFileSync } from "node:fs";
import { Pool } from "pg";

type ChunkRow = {
  title: string;
  chunk_index: number;
  body: string;
};

type BoundaryRow = {
  chunk_index: number;
  preview: string;
};

const DOC_TITLES = [
  "Testbed Britain: An Architecture for Scalable Innovation v1.0",
  "UK Maritime Decarbonisation Strategy",
  "RSSB Strategic Business Plan 2024-2029",
] as const;

const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!rawUrl) {
  throw new Error("POSTGRES_URL or DATABASE_URL is required");
}

const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function main() {
  const client = await pool.connect();
  try {
    const chunks = await client.query<ChunkRow>(
      `
      SELECT d.title, c.chunk_index, c.body
      FROM atlas.knowledge_chunks c
      JOIN atlas.knowledge_documents d ON d.id = c.document_id
      WHERE d.title = ANY($1::text[])
      ORDER BY d.title, c.chunk_index
      `,
      [DOC_TITLES],
    );

    const grouped = new Map<string, ChunkRow[]>();
    for (const row of chunks.rows) {
      const arr = grouped.get(row.title) ?? [];
      arr.push(row);
      grouped.set(row.title, arr);
    }

    const boundary = await client.query<BoundaryRow>(`
      SELECT chunk_index, LEFT(body, 300) AS preview
      FROM atlas.knowledge_chunks c
      JOIN atlas.knowledge_documents d ON d.id = c.document_id
      WHERE d.title = 'Testbed Britain: An Architecture for Scalable Innovation v1.0'
        AND (body ILIKE '%annex a%' OR body ILIKE '%instrument i%' OR body ILIKE '%glossary%')
      ORDER BY chunk_index
      LIMIT 6
    `);

    const lines: string[] = [];
    lines.push("# KB Smoke Chunk Debug Report");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Ingested Documents");
    lines.push("");

    for (const title of DOC_TITLES) {
      const rows = grouped.get(title) ?? [];
      lines.push(`### ${title}`);
      lines.push("");
      lines.push(`Chunk count: **${rows.length}**`);
      lines.push("");
      lines.push(
        "| chunk_index | char_count | token_estimate | first_200_chars |",
      );
      lines.push("|---:|---:|---:|---|");
      for (const row of rows) {
        const first200 = row.body.slice(0, 200);
        lines.push(
          `| ${row.chunk_index} | ${row.body.length} | ${estimateTokens(row.body)} | ${esc(first200)} |`,
        );
      }
      lines.push("");
    }

    lines.push("## Boundary Stress Test (Testbed Britain)");
    lines.push("");
    lines.push("Query:");
    lines.push("");
    lines.push("```sql");
    lines.push("SELECT chunk_index, LEFT(body, 300) AS preview");
    lines.push("FROM atlas.knowledge_chunks c");
    lines.push("JOIN atlas.knowledge_documents d ON d.id = c.document_id");
    lines.push(
      "WHERE d.title = 'Testbed Britain: An Architecture for Scalable Innovation v1.0'",
    );
    lines.push(
      "  AND (body ILIKE '%annex a%' OR body ILIKE '%instrument i%' OR body ILIKE '%glossary%')",
    );
    lines.push("ORDER BY chunk_index");
    lines.push("LIMIT 6;");
    lines.push("```");
    lines.push("");
    lines.push("| chunk_index | preview (first 300 chars) |");
    lines.push("|---:|---|");
    for (const row of boundary.rows) {
      lines.push(`| ${row.chunk_index} | ${esc(row.preview)} |`);
    }
    lines.push("");

    const outPath = "reports/kb-smoke-chunk-debug-report.md";
    writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
    console.log(`Wrote ${outPath}`);
    console.log(
      `Rows included: ${chunks.rows.length} chunks, ${boundary.rows.length} boundary matches`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
