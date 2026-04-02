"""
Atlas Embedding — Pass 2
Generates OpenAI text-embedding-3-small embeddings for all rows in
atlas.projects where embedding IS NULL. Stores results back in the
embedding column (VECTOR(1536)).

Resumable: skips rows where embedding IS NOT NULL. Safe to re-run.

Env vars required (from .env):
  DATABASE_URL   — Supabase transaction pooler connection string (port 6543)
  OPENAI_API_KEY — OpenAI API key
"""

import os
import time
import psycopg2
import psycopg2.extras
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

MODEL = "text-embedding-3-small"
BATCH_SIZE = 50
SLEEP_BETWEEN_BATCHES = 0.5  # seconds — stay well under OpenAI rate limits


def fetch_unembedded(conn) -> list[dict]:
    """Return all projects that still need embeddings."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, title, abstract
            FROM atlas.projects
            WHERE embedding IS NULL
            ORDER BY id
            """
        )
        return cur.fetchall()


def store_embeddings(conn, rows: list[tuple]) -> None:
    """Bulk-update embedding column. rows = list of (embedding_list, project_id)."""
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE atlas.projects SET embedding = %s::vector WHERE id = %s",
            rows,
            page_size=BATCH_SIZE,
        )
    conn.commit()


def build_input_text(row: dict) -> str:
    title = (row["title"] or "").strip()
    abstract = (row["abstract"] or "").strip()
    return f"{title}. {abstract}"


def main():
    print("Connecting to Supabase Postgres...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    conn.autocommit = False
    print("Connected.", flush=True)

    client = OpenAI(api_key=OPENAI_API_KEY)

    projects = fetch_unembedded(conn)
    total = len(projects)

    if total == 0:
        print("All projects already have embeddings. Nothing to do.")
        conn.close()
        return

    print(f"Projects to embed: {total}", flush=True)

    embedded_count = 0
    start_time = time.time()

    for batch_start in range(0, total, BATCH_SIZE):
        batch = projects[batch_start : batch_start + BATCH_SIZE]
        texts = [build_input_text(row) for row in batch]

        try:
            response = client.embeddings.create(input=texts, model=MODEL)
        except Exception as e:
            print(f"  OpenAI error on batch starting at {batch_start}: {e}", flush=True)
            time.sleep(10)
            continue

        updates = [
            (str(item.embedding), batch[item.index]["id"])
            for item in response.data
        ]

        store_embeddings(conn, updates)
        embedded_count += len(updates)

        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(
            f"Batch {batch_num}/{total_batches}: embedded {len(updates)} projects. "
            f"Total so far: {embedded_count}",
            flush=True,
        )

        if batch_start + BATCH_SIZE < total:
            time.sleep(SLEEP_BETWEEN_BATCHES)

    conn.close()

    elapsed = time.time() - start_time
    elapsed_min = int(elapsed // 60)
    elapsed_sec = int(elapsed % 60)

    print(f"\n{'=' * 50}", flush=True)
    print(f"COMPLETE", flush=True)
    print(f"Embedded: {embedded_count} / {total} projects", flush=True)
    print(f"Model:    {MODEL}", flush=True)
    print(f"Runtime:  {elapsed_min}m {elapsed_sec}s", flush=True)
    print(f"{'=' * 50}", flush=True)


if __name__ == "__main__":
    main()
