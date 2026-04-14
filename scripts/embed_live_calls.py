"""
Embed atlas.live_calls rows that are missing embeddings.

Skips rows where embedding IS NOT NULL.
For each row WHERE embedding IS NULL:
  - Builds text from title + description
  - Calls OpenAI text-embedding-3-small
  - UPDATEs the row's embedding column

Batches calls in groups of 50 to stay within OpenAI token limits.
Sleeps 0.1s between batch API calls.

Env:
  DATABASE_URL   — Supabase transaction pooler URI (port 6543, sslmode=require)
  OPENAI_API_KEY — OpenAI API key
"""

from __future__ import annotations

import os
import time

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
MODEL = "text-embedding-3-small"
BATCH_SIZE = 50


def main() -> None:
    print("Connecting to DB...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    conn.autocommit = False
    client = OpenAI(api_key=OPENAI_API_KEY)

    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(
            "SELECT id, title, description FROM atlas.live_calls WHERE embedding IS NULL ORDER BY scraped_at"
        )
        rows = cur.fetchall()

    total = len(rows)
    print(f"Found {total} live calls without embeddings.", flush=True)

    if total == 0:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM atlas.live_calls")
            grand_total = cur.fetchone()[0]
        conn.close()
        print(f"All {grand_total} live calls already have embeddings. Done.")
        return

    embedded = 0
    for batch_start in range(0, total, BATCH_SIZE):
        batch = rows[batch_start : batch_start + BATCH_SIZE]
        texts = [
            ((r["title"] or "") + " " + (r["description"] or "")).strip()
            for r in batch
        ]
        ids = [str(r["id"]) for r in batch]

        print(
            f"  Embedding batch {batch_start + 1}–{batch_start + len(batch)} of {total}...",
            flush=True,
        )

        emb_resp = client.embeddings.create(input=texts, model=MODEL)
        vectors = [emb_resp.data[i].embedding for i in range(len(emb_resp.data))]

        with conn.cursor() as cur:
            for row_id, vec in zip(ids, vectors):
                vec_str = str(vec)
                cur.execute(
                    "UPDATE atlas.live_calls SET embedding = %s::vector WHERE id = %s",
                    (vec_str, row_id),
                )
        conn.commit()
        embedded += len(batch)

        time.sleep(0.1)

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), COUNT(embedding) FROM atlas.live_calls")
        grand_total, has_embedding = cur.fetchone()

    conn.close()

    print(f"\n{'=' * 50}", flush=True)
    print("COMPLETE", flush=True)
    print(f"Embedded this run  : {embedded}", flush=True)
    print(f"With embedding     : {has_embedding} / {grand_total}", flush=True)
    print(f"Still missing      : {grand_total - has_embedding}", flush=True)
    print(f"{'=' * 50}", flush=True)


if __name__ == "__main__":
    main()
