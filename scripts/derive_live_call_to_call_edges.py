"""
Build atlas.live_call_to_call_edges — semantic similarity links between pairs
of live funding calls using pgvector cosine distance.

For every live call with an embedding, finds the top-3 most similar OTHER live
calls (similarity > 0.75). Only one edge per pair is created by normalising
so source_call_id < target_call_id. The entire computation runs inside
Postgres via a LATERAL join — no Python loop.

Threshold: 0.75 (higher than project edges — calls must be very similar to connect).

Env:
  DATABASE_URL  — Supabase transaction pooler URI (port 6543, sslmode=require)
"""

from __future__ import annotations

import os

import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS atlas.live_call_to_call_edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_call_id  UUID REFERENCES atlas.live_calls(id),
    target_call_id  UUID REFERENCES atlas.live_calls(id),
    similarity_score NUMERIC,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_UNIQUE_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS live_call_to_call_edges_pair_key
ON atlas.live_call_to_call_edges (source_call_id, target_call_id);
"""

INSERT_SQL = """
WITH candidates AS (
    SELECT
        LEAST(lc1.id::text, top3.other_id::text)::uuid   AS source_call_id,
        GREATEST(lc1.id::text, top3.other_id::text)::uuid AS target_call_id,
        top3.sim                                           AS similarity_score
    FROM atlas.live_calls lc1
    CROSS JOIN LATERAL (
        SELECT
            lc2.id                                              AS other_id,
            (1 - (lc1.embedding <=> lc2.embedding))::NUMERIC   AS sim
        FROM atlas.live_calls lc2
        WHERE lc2.id != lc1.id
          AND lc2.embedding IS NOT NULL
        ORDER BY lc1.embedding <=> lc2.embedding
        LIMIT 3
    ) top3
    WHERE lc1.embedding IS NOT NULL
      AND top3.sim > 0.75
)
INSERT INTO atlas.live_call_to_call_edges (source_call_id, target_call_id, similarity_score)
SELECT DISTINCT source_call_id, target_call_id, similarity_score
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
    print("Table atlas.live_call_to_call_edges ready.", flush=True)

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM atlas.live_call_to_call_edges")
        before = cur.fetchone()[0]

    print(
        "Computing top-3 similar calls per live call (pgvector LATERAL join)...",
        flush=True,
    )
    print("  Threshold: similarity_score > 0.75, one edge per pair.", flush=True)

    with conn.cursor() as cur:
        cur.execute(INSERT_SQL)
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM atlas.live_call_to_call_edges")
        total = cur.fetchone()[0]

    conn.close()

    inserted = total - before
    print(f"\n{'=' * 55}", flush=True)
    print("COMPLETE", flush=True)
    print(f"New edges inserted               : {inserted}", flush=True)
    print(f"Total in atlas.live_call_to_call_edges: {total}", flush=True)
    print(f"{'=' * 55}", flush=True)


if __name__ == "__main__":
    main()
