/**
 * KB document ingestion — fetch bytes, extract text, chunk, embed,
 * persist to atlas.knowledge_chunks (admin/server use; caller must enforce auth).
 */

import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

import { downloadFromPassportBucket } from "@/lib/kb/download-from-passport-bucket";
import { extractKbDocumentText } from "@/lib/kb/extract-document-text";
import {
  pgKnowledgeRepository,
  type UpsertChunkInput,
} from "@/lib/db/pg/repositories/knowledge-repository.pg";
import type { AccessScope } from "@/lib/db/pg/repositories/access-scope";

import { chunkPlainText, estimateTokenCount } from "./chunk-text";

const systemScope: AccessScope = { kind: "system" };

const CONCURRENT_EMBEDS = 8;

function mimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return "application/octet-stream";
}

async function embedChunksInParallel(bodies: string[]): Promise<number[][]> {
  const embeddings: number[][] = new Array(bodies.length);
  let i = 0;
  while (i < bodies.length) {
    const batch = bodies.slice(i, i + CONCURRENT_EMBEDS);
    const vectors = await Promise.all(
      batch.map(async (body) => {
        const text = body.length > 30000 ? body.slice(0, 30000) : body;
        const { embedding } = await embed({
          model: openai.embedding("text-embedding-3-small"),
          value: text,
        });
        return embedding;
      }),
    );
    vectors.forEach((v, j) => {
      embeddings[i + j] = v;
    });
    i += batch.length;
  }
  return embeddings;
}

export type IngestKnowledgeDocumentResult = {
  documentId: string;
  title: string;
  chunkCount: number;
  format: string;
  charCount: number;
};

/**
 * Ingest a single KB document by primary key. Deletes existing chunks first,
 * then inserts fresh rows with embeddings and stamps chunks_refreshed_at.
 */
export async function ingestKnowledgeDocumentById(
  documentId: string,
): Promise<IngestKnowledgeDocumentResult> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for embeddings");
  }

  const doc = await pgKnowledgeRepository.getDocumentById(
    documentId,
    systemScope,
  );
  if (!doc) throw new Error(`Knowledge document not found: ${documentId}`);

  let buffer: Buffer;
  let filename: string;
  let mimeType: string;

  if (doc.storageKey) {
    buffer = await downloadFromPassportBucket(doc.storageKey);
    filename = doc.storageKey.split("/").pop() ?? "document.bin";
    mimeType = mimeFromFilename(filename);
  } else if (doc.sourceUrl) {
    const res = await fetch(doc.sourceUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${doc.sourceUrl}: HTTP ${res.status}`);
    }
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
    try {
      filename = new URL(doc.sourceUrl).pathname.split("/").pop() ?? "doc.bin";
    } catch {
      filename = "document.bin";
    }
    const ct = res.headers.get("content-type")?.split(";")[0]?.trim();
    mimeType =
      ct && ct !== "application/octet-stream" ? ct : mimeFromFilename(filename);
  } else {
    throw new Error(
      `Document "${doc.title}" has neither storage_key nor source_url`,
    );
  }

  const extracted = await extractKbDocumentText(buffer, mimeType, filename);
  const pieces = chunkPlainText(extracted.text);

  if (pieces.length === 0) {
    await pgKnowledgeRepository.deleteChunks(documentId, systemScope);
    await pgKnowledgeRepository.stampChunksRefreshed(documentId, systemScope);
    return {
      documentId,
      title: doc.title,
      chunkCount: 0,
      format: extracted.format,
      charCount: extracted.charCount,
    };
  }

  const vectors = await embedChunksInParallel(pieces);

  const rows: UpsertChunkInput[] = pieces.map((body, idx) => ({
    chunkIndex: idx,
    body,
    tokenCount: estimateTokenCount(body),
    embedding: vectors[idx] ?? null,
  }));

  await pgKnowledgeRepository.deleteChunks(documentId, systemScope);
  await pgKnowledgeRepository.upsertChunks(documentId, rows, systemScope);
  await pgKnowledgeRepository.stampChunksRefreshed(documentId, systemScope);

  return {
    documentId,
    title: doc.title,
    chunkCount: pieces.length,
    format: extracted.format,
    charCount: extracted.charCount,
  };
}

/** Resolve a document id by exact title match (first match wins). */
export async function findKnowledgeDocumentIdByTitle(
  title: string,
): Promise<string | null> {
  const rows = await pgKnowledgeRepository.listDocuments({}, systemScope);
  const hit = rows.find((d) => d.title === title);
  return hit?.id ?? null;
}
