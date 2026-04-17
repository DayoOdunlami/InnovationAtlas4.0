"""
Build atlas.project_edges from three edge types only:
  - shared_org:  same lead_org_name (weight 1.0)
  - shared_topic: overlapping research_topics[] (weight 0.6)
  - semantic:     cosine similarity on embedding > 0.85, weight = similarity
                  (projects with transport_relevance_score >= 0.5 only)

On each run: TRUNCATE atlas.project_edges first (drops legacy edge types).

Env:
  DATABASE_URL — Supabase transaction pooler (port 6543, sslmode=require)
"""

from __future__ import annotations

import os
import time

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS atlas.project_edges (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id  UUID REFERENCES atlas.projects(id),
    target_id  UUID REFERENCES atlas.projects(id),
    weight     NUMERIC,
    edge_type  TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_UNIQUE_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS project_edges_pair_type_key
ON atlas.project_edges (
    LEAST(source_id::text, target_id::text),
    GREATEST(source_id::text, target_id::text),
    edge_type
);
"""

INSERT_EDGE_SQL = """
INSERT INTO atlas.project_edges (source_id, target_id, weight, edge_type)
VALUES (%s, %s, %s, %s)
ON CONFLICT DO NOTHING
"""


def ensure_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)
        cur.execute(CREATE_UNIQUE_INDEX_SQL)
    conn.commit()
    print("Table atlas.project_edges ready.", flush=True)


def insert_edges(conn, edges: list[tuple], edge_type: str) -> int:
    if not edges:
        return 0
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM atlas.project_edges WHERE edge_type = %s",
            (edge_type,),
        )
        count_before = cur.fetchone()[0]
        psycopg2.extras.execute_batch(cur, INSERT_EDGE_SQL, edges, page_size=500)
    conn.commit()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM atlas.project_edges WHERE edge_type = %s",
            (edge_type,),
        )
        count_after = cur.fetchone()[0]
    return count_after - count_before


SHARED_ORG_SQL = """
SELECT a.id AS src, b.id AS tgt
FROM   atlas.projects a
JOIN   atlas.projects b ON a.lead_org_name = b.lead_org_name
WHERE  a.lead_org_name IS NOT NULL
  AND  a.id < b.id
"""


def build_shared_org_edges(conn) -> list[tuple]:
    print("Building shared_org edges...", flush=True)
    with conn.cursor() as cur:
        cur.execute(SHARED_ORG_SQL)
        rows = cur.fetchall()
    edges = [(str(r[0]), str(r[1]), 1.0, "shared_org") for r in rows]
    print(f"  Candidate shared_org pairs: {len(edges)}", flush=True)
    return edges


SEMANTIC_SQL = """
SELECT a.id AS src, b.id AS tgt,
       (1 - (a.embedding <=> b.embedding))::double precision AS similarity
FROM   atlas.projects a
JOIN   atlas.projects b ON a.id < b.id
WHERE  a.embedding IS NOT NULL
  AND  b.embedding IS NOT NULL
  AND  a.transport_relevance_score >= 0.5
  AND  b.transport_relevance_score >= 0.5
  AND  (1 - (a.embedding <=> b.embedding)) > 0.85
"""


def build_semantic_edges(conn) -> list[tuple]:
    print("Building semantic edges (relevance >= 0.5, sim > 0.85)...", flush=True)
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute(SEMANTIC_SQL)
        rows = cur.fetchall()
    elapsed = time.time() - t0
    edges = [
        (str(r[0]), str(r[1]), round(float(r[2]), 6), "semantic") for r in rows
    ]
    print(f"  Query {elapsed:.1f}s — {len(edges)} semantic pairs.", flush=True)
    return edges


SHARED_TOPIC_SQL = """
SELECT DISTINCT a.id AS src, b.id AS tgt
FROM   atlas.projects a
JOIN   atlas.projects b ON a.id < b.id
WHERE  a.research_topics IS NOT NULL
  AND  b.research_topics IS NOT NULL
  AND  a.research_topics && b.research_topics
"""


def build_shared_topic_edges(conn) -> list[tuple]:
    print("Building shared_topic edges...", flush=True)
    with conn.cursor() as cur:
        cur.execute(SHARED_TOPIC_SQL)
        rows = cur.fetchall()
    edges = [(str(r[0]), str(r[1]), 0.6, "shared_topic") for r in rows]
    print(f"  Candidate shared_topic pairs: {len(edges)}", flush=True)
    return edges


def main() -> None:
    print("Connecting to DB...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    conn.autocommit = False

    ensure_table(conn)

    print("TRUNCATE atlas.project_edges ...", flush=True)
    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE atlas.project_edges")
    conn.commit()

    org_edges = build_shared_org_edges(conn)
    print(f"  Inserted {insert_edges(conn, org_edges, 'shared_org')} shared_org edges.")

    sem_edges = build_semantic_edges(conn)
    print(f"  Inserted {insert_edges(conn, sem_edges, 'semantic')} semantic edges.")

    topic_edges = build_shared_topic_edges(conn)
    print(f"  Inserted {insert_edges(conn, topic_edges, 'shared_topic')} shared_topic edges.")

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT edge_type, COUNT(*), ROUND(AVG(weight)::numeric, 4)
            FROM atlas.project_edges
            GROUP BY edge_type
            ORDER BY edge_type
            """
        )
        breakdown = cur.fetchall()
        cur.execute("SELECT COUNT(*) FROM atlas.project_edges")
        total = cur.fetchone()[0]

    conn.close()
    print("\n" + "=" * 50)
    print(f"COMPLETE — total edges: {total}")
    for row in breakdown:
        print(f"  {row[0]}: count={row[1]} avg_weight={row[2]}")
    print("=" * 50, flush=True)


if __name__ == "__main__":
    main()
