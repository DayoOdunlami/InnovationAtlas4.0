"""
Build atlas.project_edges from five edge types:
  - shared_org:            projects sharing the same lead_org_name (weight 1.0)
  - semantic_similarity:   cosine similarity on embedding > 0.85   (weight 0.7)
  - shared_topics:         projects sharing ≥1 research_topics element (weight 0.6)
  - shared_research_area:  projects whose abstract both contain keywords from the
                           same semantic group (weight 0.5)
  - same_funder:           projects sharing the same lead_funder (weight 0.4)
                           — stored in DB but NOT shown by default in the force graph;
                           toggled via the "Show funder links" UI control.

Rules:
  - No self-edges (source_id != target_id)
  - No duplicate edges (INSERT ... ON CONFLICT DO NOTHING)
  - Only one direction per pair per type (source_id < target_id)
  - shared_research_area is only created where no edge of ANY type already exists
    between the pair (avoids redundant weak edges where stronger ones exist)

Env:
  DATABASE_URL  — Supabase transaction pooler URI (port 6543, sslmode=require)
"""

from __future__ import annotations

import os
import time
from collections import defaultdict
from itertools import combinations

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
    """Batch-insert edges, return number accepted (conflict = skip)."""
    if not edges:
        return 0
    with conn.cursor() as cur:
        before = conn.cursor()
        before.execute("SELECT COUNT(*) FROM atlas.project_edges WHERE edge_type = %s", (edge_type,))
        count_before = before.fetchone()[0]
        before.close()

        psycopg2.extras.execute_batch(cur, INSERT_EDGE_SQL, edges, page_size=500)
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM atlas.project_edges WHERE edge_type = %s", (edge_type,))
        count_after = cur.fetchone()[0]

    inserted = count_after - count_before
    return inserted


# ---------------------------------------------------------------------------
# Edge type 1: shared_org  (weight 1.0)
# ---------------------------------------------------------------------------

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
    print(f"  Found {len(edges)} candidate shared_org pairs.", flush=True)
    return edges


# ---------------------------------------------------------------------------
# Edge type 2: semantic_similarity  (weight 0.7)
# Using pgvector cosine distance: similarity = 1 - (a.embedding <=> b.embedding)
# ---------------------------------------------------------------------------

SEMANTIC_SQL = """
SELECT a.id AS src, b.id AS tgt,
       1 - (a.embedding <=> b.embedding) AS similarity
FROM   atlas.projects a
JOIN   atlas.projects b ON a.id < b.id
WHERE  a.embedding IS NOT NULL
  AND  b.embedding IS NOT NULL
  AND  1 - (a.embedding <=> b.embedding) > 0.85
"""


def build_semantic_edges(conn) -> list[tuple]:
    print("Building semantic_similarity edges (pgvector cosine)...", flush=True)
    print("  This query scans all embedding pairs — may take 30-120s.", flush=True)
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute(SEMANTIC_SQL)
        rows = cur.fetchall()
    elapsed = time.time() - t0
    print(f"  Query completed in {elapsed:.1f}s. Found {len(rows)} pairs > 0.85.", flush=True)
    edges = [(str(r[0]), str(r[1]), 0.7, "semantic_similarity") for r in rows]
    return edges


# ---------------------------------------------------------------------------
# Edge type 3: shared_topics  (weight 0.6)
# ---------------------------------------------------------------------------

SHARED_TOPICS_SQL = """
SELECT DISTINCT a.id AS src, b.id AS tgt
FROM   atlas.projects a
JOIN   atlas.projects b ON a.id < b.id
WHERE  a.research_topics IS NOT NULL
  AND  b.research_topics IS NOT NULL
  AND  a.research_topics && b.research_topics
"""


def build_shared_topics_edges(conn) -> list[tuple]:
    print("Building shared_topics edges...", flush=True)
    with conn.cursor() as cur:
        cur.execute(SHARED_TOPICS_SQL)
        rows = cur.fetchall()
    edges = [(str(r[0]), str(r[1]), 0.6, "shared_topics") for r in rows]
    print(f"  Found {len(edges)} candidate shared_topics pairs.", flush=True)
    return edges


# ---------------------------------------------------------------------------
# Edge type 4: shared_research_area  (weight 0.5)
# Keyword-group matching on project abstract text. Only created for pairs
# that do not already have any edge (avoids redundant weak connections).
# ---------------------------------------------------------------------------

RESEARCH_GROUPS: dict[str, list[str]] = {
    "autonomy": ["autonomous", "self-driving", "unmanned", "robot", "drone", "uas", "bvlos"],
    "decarbonisation": ["hydrogen", "electric", "zero emission", "net zero", "carbon", "decarboni"],
    "safety": ["safety", "hazop", "certification", "inspection", "monitoring", "maintenance"],
    "digital": ["digital twin", "ai", "machine learning", "sensor", "data", "analytics"],
    "connectivity": ["connected", "v2x", "5g", "communication", "network", "iot"],
}


def build_shared_research_area_edges(conn, existing_pairs: set[tuple[str, str]]) -> list[tuple]:
    print("Building shared_research_area edges (keyword group matching)...", flush=True)
    with conn.cursor() as cur:
        cur.execute("SELECT id, abstract FROM atlas.projects WHERE abstract IS NOT NULL AND abstract != ''")
        rows = cur.fetchall()

    print(f"  Loaded {len(rows)} projects with abstracts.", flush=True)

    # Build group -> set of project IDs
    group_members: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        proj_id = str(row[0])
        text = (row[1] or "").lower()
        for group, keywords in RESEARCH_GROUPS.items():
            if any(kw in text for kw in keywords):
                group_members[group].append(proj_id)

    for g, members in group_members.items():
        print(f"  Group '{g}': {len(members)} projects matched.", flush=True)

    edges: list[tuple] = []
    seen: set[tuple[str, str]] = set()

    for group, members in group_members.items():
        for id_a, id_b in combinations(sorted(members), 2):
            src = min(id_a, id_b)
            tgt = max(id_a, id_b)
            pair = (src, tgt)
            # Skip if this pair (any type) already exists or we already generated it
            if pair in existing_pairs or pair in seen:
                continue
            seen.add(pair)
            edges.append((src, tgt, 0.5, "shared_research_area"))

    print(f"  Found {len(edges)} new shared_research_area pairs.", flush=True)
    return edges


# ---------------------------------------------------------------------------
# Edge type 5: same_funder  (weight 0.4)
# NOT shown by default in the force graph — toggle via "Show funder links".
# ---------------------------------------------------------------------------

SAME_FUNDER_SQL = """
SELECT a.id AS src, b.id AS tgt
FROM   atlas.projects a
JOIN   atlas.projects b ON a.lead_funder = b.lead_funder
WHERE  a.lead_funder IS NOT NULL
  AND  a.id < b.id
"""


def build_same_funder_edges(conn) -> list[tuple]:
    print("Building same_funder edges...", flush=True)
    with conn.cursor() as cur:
        cur.execute(SAME_FUNDER_SQL)
        rows = cur.fetchall()
    edges = [(str(r[0]), str(r[1]), 0.4, "same_funder") for r in rows]
    print(f"  Found {len(edges)} candidate same_funder pairs.", flush=True)
    return edges


def top_funders_report(conn, n: int = 5) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT lead_funder, COUNT(*) AS projects
            FROM   atlas.projects
            WHERE  lead_funder IS NOT NULL
            GROUP  BY lead_funder
            ORDER  BY projects DESC
            LIMIT  %s
            """,
            (n,),
        )
        rows = cur.fetchall()
    print(f"\nTop {n} funders by project count:", flush=True)
    for funder, count in rows:
        print(f"  {funder}: {count}", flush=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("Connecting to DB...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    conn.autocommit = False

    ensure_table(conn)

    # ---- shared_org ----
    org_edges = build_shared_org_edges(conn)
    org_inserted = insert_edges(conn, org_edges, "shared_org")
    print(f"  Inserted {org_inserted} shared_org edges.", flush=True)

    # ---- semantic_similarity ----
    sem_edges = build_semantic_edges(conn)
    sem_inserted = insert_edges(conn, sem_edges, "semantic_similarity")
    print(f"  Inserted {sem_inserted} semantic_similarity edges.", flush=True)

    # ---- shared_topics ----
    topic_edges = build_shared_topics_edges(conn)
    topic_inserted = insert_edges(conn, topic_edges, "shared_topics")
    print(f"  Inserted {topic_inserted} shared_topics edges.", flush=True)

    # ---- shared_research_area — load existing pairs first ----
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT LEAST(source_id::text, target_id::text),
                   GREATEST(source_id::text, target_id::text)
            FROM   atlas.project_edges
            """
        )
        existing_pairs: set[tuple[str, str]] = {(r[0], r[1]) for r in cur.fetchall()}
    print(f"  {len(existing_pairs)} existing edge pairs loaded for dedup check.", flush=True)

    sra_edges = build_shared_research_area_edges(conn, existing_pairs)
    sra_inserted = insert_edges(conn, sra_edges, "shared_research_area")
    print(f"  Inserted {sra_inserted} shared_research_area edges.", flush=True)

    # ---- same_funder ----
    funder_edges = build_same_funder_edges(conn)
    funder_inserted = insert_edges(conn, funder_edges, "same_funder")
    print(f"  Inserted {funder_inserted} same_funder edges.", flush=True)

    # ---- summary ----
    with conn.cursor() as cur:
        cur.execute("SELECT edge_type, COUNT(*) FROM atlas.project_edges GROUP BY edge_type ORDER BY edge_type")
        breakdown = cur.fetchall()
        cur.execute("SELECT COUNT(*) FROM atlas.project_edges")
        total = cur.fetchone()[0]

    top_funders_report(conn)
    conn.close()

    print("\n" + "=" * 50, flush=True)
    print("COMPLETE", flush=True)
    print(f"Total edges in atlas.project_edges: {total}", flush=True)
    print("Breakdown by edge_type:", flush=True)
    for row in breakdown:
        print(f"  {row[0]}: {row[1]}", flush=True)
    print("=" * 50, flush=True)


if __name__ == "__main__":
    main()
