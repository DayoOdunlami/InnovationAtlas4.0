"""
embed_knowledge_documents.py — KB-1 ingestion pipeline (Phase 2b).

Embeds chunks for atlas.knowledge_documents rows that need (re-)processing:
  - status IN ('proposed', 'approved') AND
  - (chunks_refreshed_at IS NULL OR chunks_refreshed_at < updated_at)

Steps per document:
  1. Load document row.
  2. If storage_key is set: download PDF from Supabase Storage bucket
     `knowledge-documents` and extract text.
  3. Else if source_url is set: fetch via HTTP and extract body text.
  4. Chunk at ~800 tokens with ~100-token overlap (character approximation
     using 4 chars/token). Minimum chunk body: 100 chars.
  5. Embed each chunk with text-embedding-3-small (1536 dims, same model
     as atlas.projects / atlas.organisations / atlas.live_calls).
  6. DELETE existing chunks for document_id, INSERT new set, stamp
     chunks_refreshed_at = NOW().

Idempotent and resumable. Re-running after a document update only
re-processes documents whose chunks are stale.

Env:
  POSTGRES_URL or DATABASE_URL   — connection string
  OPENAI_API_KEY                 — for embeddings
  SUPABASE_URL (optional)        — for PDF download from Storage
  SUPABASE_SERVICE_KEY (optional) — service role key for Storage

Run:
  python scripts/embed_knowledge_documents.py
  python scripts/embed_knowledge_documents.py --dry-run
  python scripts/embed_knowledge_documents.py --document-id <uuid>

Expected runtime: ~5-15 seconds per document (PDF extraction + embedding).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
import uuid
from typing import Generator

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

DB_URL = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

if not DB_URL or not OPENAI_API_KEY:
    print(
        "ERROR: POSTGRES_URL/DATABASE_URL and OPENAI_API_KEY are required.",
        file=sys.stderr,
    )
    sys.exit(1)

EMBED_MODEL = "text-embedding-3-small"
CHUNK_TARGET_TOKENS = 800
CHUNK_OVERLAP_TOKENS = 100
CHARS_PER_TOKEN = 4  # approximation
CHUNK_TARGET_CHARS = CHUNK_TARGET_TOKENS * CHARS_PER_TOKEN
CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN
MIN_CHUNK_CHARS = 100
EMBED_BATCH_SIZE = 20


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // CHARS_PER_TOKEN)


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks targeting ~800 tokens each."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_TARGET_CHARS, len(text))
        # Walk back to a whitespace boundary to avoid cutting mid-word.
        if end < len(text):
            boundary = text.rfind(" ", start, end)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if len(chunk) >= MIN_CHUNK_CHARS:
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP_CHARS
        if start >= len(text):
            break
    return chunks


def fetch_text_from_url(url: str) -> str:
    """Fetch plain text from a URL. Best-effort boilerplate removal."""
    import urllib.request

    headers = {
        "User-Agent": "InnovationAtlas/1.0 KB-Embedder (mailto:support@cpcatapult.co.uk)"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch {url}: {exc}") from exc

    content_type = (
        resp.headers.get("Content-Type", "").lower()
        if hasattr(resp, "headers")
        else ""
    )

    # PDF served via URL — try to extract text.
    if "pdf" in content_type or url.lower().endswith(".pdf"):
        return extract_pdf_bytes(raw)

    # HTML — strip tags.
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-zA-Z]+;", " ", text)
    return text


def extract_pdf_bytes(data: bytes) -> str:
    """Extract text from PDF bytes using pypdf (optional dep)."""
    try:
        import io

        import pypdf  # type: ignore

        reader = pypdf.PdfReader(io.BytesIO(data))
        parts: list[str] = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        return "\n".join(parts)
    except ImportError:
        raise RuntimeError(
            "pypdf is required to extract text from PDF files. "
            "Install it with: pip install pypdf"
        )


def download_from_storage(storage_key: str) -> str:
    """Download PDF from Supabase Storage bucket `knowledge-documents`."""
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_URL"
    )
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY are required for PDF storage downloads."
        )

    import urllib.request

    url = f"{supabase_url}/storage/v1/object/knowledge-documents/{storage_key}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
    except Exception as exc:
        raise RuntimeError(
            f"Failed to download storage_key={storage_key}: {exc}"
        ) from exc

    return extract_pdf_bytes(data)


def embed_texts(client: OpenAI, texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts using text-embedding-3-small."""
    resp = client.embeddings.create(input=texts, model=EMBED_MODEL)
    return [item.embedding for item in resp.data]


def process_document(
    conn: psycopg2.extensions.connection,
    client: OpenAI,
    doc: dict,
    dry_run: bool,
) -> None:
    doc_id = str(doc["id"])
    title = doc["title"]
    source_url = doc.get("source_url")
    storage_key = doc.get("storage_key")

    print(f"\n  Processing: {title} (id={doc_id})", flush=True)

    # --- 1. Extract text ---
    try:
        if storage_key:
            print(f"    Source: Supabase Storage (key={storage_key})", flush=True)
            raw_text = download_from_storage(storage_key)
        elif source_url:
            print(f"    Source: URL ({source_url})", flush=True)
            raw_text = fetch_text_from_url(source_url)
        else:
            print("    SKIP: no source_url and no storage_key", flush=True)
            return
    except RuntimeError as exc:
        print(f"    ERROR extracting text: {exc}", file=sys.stderr)
        return

    if not raw_text.strip():
        print("    SKIP: extracted text is empty", flush=True)
        return

    # --- 2. Chunk ---
    chunks = chunk_text(raw_text)
    if not chunks:
        print("    SKIP: no chunks produced", flush=True)
        return
    print(f"    Chunks: {len(chunks)}", flush=True)

    if dry_run:
        for i, c in enumerate(chunks[:3]):
            print(f"    [DRY-RUN] chunk {i}: {len(c)} chars / ~{estimate_tokens(c)} tokens")
        if len(chunks) > 3:
            print(f"    [DRY-RUN] … and {len(chunks) - 3} more")
        return

    # --- 3. Embed in batches ---
    all_embeddings: list[list[float]] = []
    for batch_start in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[batch_start : batch_start + EMBED_BATCH_SIZE]
        embeddings = embed_texts(client, batch)
        all_embeddings.extend(embeddings)
        print(
            f"    Embedded {min(batch_start + EMBED_BATCH_SIZE, len(chunks))}/{len(chunks)}",
            flush=True,
        )
        if batch_start + EMBED_BATCH_SIZE < len(chunks):
            time.sleep(0.1)

    # --- 4. Delete old chunks, insert new, stamp ---
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM atlas.knowledge_chunks WHERE document_id = %s", (doc_id,)
        )
        chunk_rows = [
            (
                str(uuid.uuid4()),
                doc_id,
                idx,
                body,
                estimate_tokens(body),
                str(embedding),
            )
            for idx, (body, embedding) in enumerate(zip(chunks, all_embeddings))
        ]
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO atlas.knowledge_chunks
              (id, document_id, chunk_index, body, token_count, embedding)
            VALUES (%s, %s, %s, %s, %s, %s::vector)
            """,
            chunk_rows,
            page_size=50,
        )
        cur.execute(
            """
            UPDATE atlas.knowledge_documents
            SET chunks_refreshed_at = NOW(), updated_at = NOW()
            WHERE id = %s
            """,
            (doc_id,),
        )
    conn.commit()
    print(f"    Done: {len(chunks)} chunks inserted.", flush=True)


def load_pending_documents(
    conn: psycopg2.extensions.connection, document_id: str | None
) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if document_id:
            cur.execute(
                """
                SELECT id, title, source_url, storage_key, status
                FROM atlas.knowledge_documents
                WHERE id = %s
                """,
                (document_id,),
            )
        else:
            cur.execute(
                """
                SELECT id, title, source_url, storage_key, status
                FROM atlas.knowledge_documents
                WHERE status IN ('proposed', 'approved')
                  AND (
                    chunks_refreshed_at IS NULL
                    OR chunks_refreshed_at < updated_at
                  )
                ORDER BY added_at
                """
            )
        return cur.fetchall()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Embed atlas.knowledge_documents chunks."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract and chunk text but do not embed or write to DB.",
    )
    parser.add_argument(
        "--document-id",
        metavar="UUID",
        help="Process a single document by id (regardless of refresh state).",
    )
    args = parser.parse_args()

    conn_str = DB_URL.replace("?sslmode=require", "").replace("&sslmode=require", "")
    conn = psycopg2.connect(conn_str, sslmode="require")
    client = OpenAI(api_key=OPENAI_API_KEY)

    docs = load_pending_documents(conn, args.document_id)
    total = len(docs)
    print(f"Documents to process: {total}", flush=True)
    if total == 0:
        print("Nothing to do.")
        conn.close()
        return

    for doc in docs:
        process_document(conn, client, dict(doc), dry_run=args.dry_run)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*), COUNT(*) FILTER (WHERE chunks_refreshed_at IS NOT NULL) "
            "FROM atlas.knowledge_documents"
        )
        row = cur.fetchone()
        tot, embedded = row if row else (0, 0)

    conn.close()
    print(
        f"\nDone. knowledge_documents total={tot}, with_chunks={embedded}",
        flush=True,
    )


if __name__ == "__main__":
    main()
