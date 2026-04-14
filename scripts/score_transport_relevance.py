"""
Transport relevance — cosine similarity vs a fixed phrase embedding.

For each row in atlas.projects with a non-null embedding, sets
transport_relevance_score in [0.0, 1.0] as (cosine_similarity + 1) / 2
against the text-embedding-3-small vector for the reference phrase.

Env: DATABASE_URL, OPENAI_API_KEY (see .env)
"""

from __future__ import annotations

import os
import time

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI
from sklearn.metrics.pairwise import cosine_similarity

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

MODEL = "text-embedding-3-small"
BATCH_SIZE = 50
REFERENCE_PHRASE = (
    "transport innovation autonomous decarbonisation mobility infrastructure"
)


def parse_embedding(raw: object) -> np.ndarray:
    if raw is None:
        return np.array([], dtype=np.float64)
    if isinstance(raw, (list, tuple)):
        return np.array([float(x) for x in raw], dtype=np.float64)
    if isinstance(raw, np.ndarray):
        return raw.astype(np.float64).flatten()
    s = str(raw).strip()
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1]
        parts = [p.strip() for p in s.split(",") if p.strip()]
        return np.array([float(x) for x in parts], dtype=np.float64)
    return np.array([], dtype=np.float64)


def score_from_cosine(cos: float) -> float:
    """Map cosine similarity from [-1, 1] to [0, 1]."""
    return float(max(0.0, min(1.0, (cos + 1.0) / 2.0)))


def ensure_column(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            ALTER TABLE atlas.projects
            ADD COLUMN IF NOT EXISTS transport_relevance_score DOUBLE PRECISION
            DEFAULT 0
            """
        )
    conn.commit()


def main() -> None:
    print("Connecting...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    conn.autocommit = False
    ensure_column(conn)

    client = OpenAI(api_key=OPENAI_API_KEY)
    print(f"Embedding reference phrase with {MODEL}...", flush=True)
    ref_resp = client.embeddings.create(input=[REFERENCE_PHRASE], model=MODEL)
    ref_vec = np.array(ref_resp.data[0].embedding, dtype=np.float64).reshape(1, -1)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, embedding
            FROM atlas.projects
            WHERE embedding IS NOT NULL
            ORDER BY id
            """
        )
        rows = cur.fetchall()

    total = len(rows)
    print(f"Projects with embeddings: {total}", flush=True)
    if total == 0:
        conn.close()
        return

    updates: list[tuple[float, object]] = []
    t0 = time.time()

    for batch_start in range(0, total, BATCH_SIZE):
        batch = rows[batch_start : batch_start + BATCH_SIZE]
        mat = np.stack([parse_embedding(r["embedding"]) for r in batch], axis=0)
        sims = cosine_similarity(ref_vec, mat)[0]
        for i, row in enumerate(batch):
            updates.append((score_from_cosine(float(sims[i])), row["id"]))

        batch_num = batch_start // BATCH_SIZE + 1
        n_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(
            f"Batch {batch_num}/{n_batches}: scored {len(batch)} "
            f"(running {batch_start + len(batch)}/{total})",
            flush=True,
        )

    print("Writing scores to database...", flush=True)
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            UPDATE atlas.projects
            SET transport_relevance_score = %s
            WHERE id = %s
            """,
            updates,
            page_size=BATCH_SIZE,
        )
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM atlas.projects")
        n_all = cur.fetchone()[0]
        cur.execute(
            """
            SELECT count(*) FROM atlas.projects
            WHERE transport_relevance_score IS NOT NULL
              AND transport_relevance_score > 0
            """
        )
        n_nonzero = cur.fetchone()[0]
        cur.execute(
            """
            SELECT count(*) FROM atlas.projects
            WHERE embedding IS NULL
               OR transport_relevance_score IS NULL
               OR transport_relevance_score <= 0
            """
        )
        n_bad = cur.fetchone()[0]

    conn.close()
    elapsed = time.time() - t0
    print(f"\n{'=' * 50}", flush=True)
    print("COMPLETE", flush=True)
    print(f"Updated scores for: {len(updates)} projects (with embeddings)", flush=True)
    print(f"Total projects in table: {n_all}", flush=True)
    print(f"Rows with non-zero transport_relevance_score: {n_nonzero}", flush=True)
    print(f"Rows still zero / null / missing embedding: {n_bad}", flush=True)
    print(f"Runtime: {elapsed:.1f}s", flush=True)
    print(f"{'=' * 50}", flush=True)


if __name__ == "__main__":
    main()
