"""
Build atlas.live_call_edges — semantic similarity links between live funding
calls and GtR projects using pgvector cosine distance.

For every live call with an embedding, finds the top-5 most similar projects
(also with embeddings) where cosine similarity > 0.6.  Uses a pgvector
LATERAL join so the entire computation runs inside Postgres — no Python loop.

Env:
  DATABASE_URL  — Supabase transaction pooler URI (port 6543, sslmode=require)
"""

from __future__ import annotations

import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS atlas.live_call_edges (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_call_id     UUID REFERENCES atlas.live_calls(id),
    project_id       UUID REFERENCES atlas.projects(id),
    similarity_score NUMERIC,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_UNIQUE_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS live_call_edges_pair_key
ON atlas.live_call_edges (live_call_id, project_id);
"""

INSERT_SQL = """
WITH candidates AS (
    SELECT
        lc.id            AS live_call_id,
        top5.project_id  AS project_id,
        top5.sim         AS similarity_score
    FROM atlas.live_calls lc
    CROSS JOIN LATERAL (
        SELECT p.id AS project_id,
               (1 - (lc.embedding <=> p.embedding))::NUMERIC AS sim
        FROM   atlas.projects p
        WHERE  p.embedding IS NOT NULL
        ORDER  BY lc.embedding <=> p.embedding
        LIMIT  5
    ) top5
    WHERE lc.embedding IS NOT NULL
      AND top5.sim > 0.6
)
INSERT INTO atlas.live_call_edges (live_call_id, project_id, similarity_score)
SELECT live_call_id, project_id, similarity_score
FROM   candidates
ON CONFLICT DO NOTHING
"""


def main() -> None:
    print("Connecting to DB...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    conn.autocommit = False

    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)
        cur.execute(CREATE_UNIQUE_INDEX_SQL)
    conn.commit()
    print("Table atlas.live_call_edges ready.", flush=True)

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM atlas.live_call_edges")
        before = cur.fetchone()[0]

    print("Computing top-5 similar projects per live call (pgvector LATERAL join)...", flush=True)
    print("  Filtering: similarity_score > 0.6, only rows with embeddings.", flush=True)

    with conn.cursor() as cur:
        cur.execute(INSERT_SQL)
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM atlas.live_call_edges")
        total = cur.fetchone()[0]

    conn.close()

    inserted = total - before
    print(f"\n{'=' * 50}", flush=True)
    print("COMPLETE", flush=True)
    print(f"New live_call_edges inserted : {inserted}", flush=True)
    print(f"Total in atlas.live_call_edges: {total}", flush=True)
    print(f"{'=' * 50}", flush=True)


if __name__ == "__main__":
    main()
