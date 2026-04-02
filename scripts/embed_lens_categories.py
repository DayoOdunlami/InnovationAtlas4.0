"""
Lens Category Embedding
Generates OpenAI text-embedding-3-small embeddings for all 14 rows in
atlas.lens_categories where embedding IS NULL.

These embeddings enable semantic lens matching — without them, CPC
Rail/Maritime/Aviation/Highways lenses cannot be applied at query time.

Resumable: skips rows where embedding IS NOT NULL. Safe to re-run.

Env vars required (from .env):
  DATABASE_URL   — Supabase transaction pooler connection string (port 6543)
  OPENAI_API_KEY — OpenAI API key
"""

import os
import psycopg2
import psycopg2.extras
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

MODEL = "text-embedding-3-small"


def fetch_unembedded(conn) -> list[dict]:
    """Return all lens categories that still need embeddings."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT lc.id, lc.name, lc.description, l.name AS lens_name
            FROM atlas.lens_categories lc
            JOIN atlas.lenses l ON l.id = lc.lens_id
            WHERE lc.embedding IS NULL
            ORDER BY l.name, lc.name
            """
        )
        return cur.fetchall()


def store_embedding(conn, category_id: str, embedding: list[float]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE atlas.lens_categories SET embedding = %s::vector WHERE id = %s",
            (str(embedding), category_id),
        )
    conn.commit()


def main():
    print("Connecting to Supabase Postgres...", flush=True)
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    print("Connected.", flush=True)

    client = OpenAI(api_key=OPENAI_API_KEY)

    categories = fetch_unembedded(conn)
    total = len(categories)

    if total == 0:
        print("All lens categories already have embeddings. Nothing to do.")
        conn.close()
        return

    print(f"Lens categories to embed: {total}", flush=True)

    for i, row in enumerate(categories, start=1):
        text = (row["description"] or "").strip()
        if not text:
            print(f"  [{i}/{total}] SKIPPED (empty description): {row['lens_name']} / {row['name']}", flush=True)
            continue

        try:
            response = client.embeddings.create(input=[text], model=MODEL)
        except Exception as e:
            print(f"  [{i}/{total}] ERROR embedding {row['name']}: {e}", flush=True)
            continue

        embedding = response.data[0].embedding
        store_embedding(conn, row["id"], embedding)

        print(
            f"  [{i}/{total}] Embedded: {row['lens_name']} / {row['name']}",
            flush=True,
        )

    conn.close()

    print(f"\n{'=' * 50}", flush=True)
    print(f"COMPLETE", flush=True)
    print(f"Embedded: {total} lens categories", flush=True)
    print(f"Model:    {MODEL}", flush=True)
    print(f"{'=' * 50}", flush=True)


if __name__ == "__main__":
    main()
