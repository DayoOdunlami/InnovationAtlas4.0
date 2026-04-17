"""
Populate atlas.organisations from distinct atlas.projects.lead_org_name.

Aggregates project counts, funding, funders, research topics, date span,
and average transport relevance. Rule-based org_type (no AI).

Expected row count: 319 distinct non-null lead_org_name values.

Usage:
  python scripts/extract_organisations.py

Env:
  DATABASE_URL (or POSTGRES_URL) — Supabase pooler, sslmode=require
"""

from __future__ import annotations

import hashlib
import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
if not DB_URL:
    print("ERROR: DATABASE_URL or POSTGRES_URL required.", file=sys.stderr)
    sys.exit(1)

EXPECTED_ORG_COUNT = 319

ENSURE_SQL = """
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS org_type TEXT;
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS project_count INTEGER;
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS total_funding NUMERIC;
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS funders TEXT[];
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS research_topics TEXT[];
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS first_project_year INTEGER;
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS last_project_year INTEGER;
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS avg_transport_relevance NUMERIC;
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS viz_x NUMERIC;
ALTER TABLE atlas.organisations ADD COLUMN IF NOT EXISTS viz_y NUMERIC;

CREATE UNIQUE INDEX IF NOT EXISTS organisations_name_idx ON atlas.organisations(name);
"""


def surrogate_gtr_id(org_name: str) -> str:
    """Stable synthetic gtr_id — atlas.organisations.gtr_id is NOT NULL + UNIQUE."""
    digest = hashlib.sha256(org_name.strip().encode("utf-8")).hexdigest()[:36]
    return f"org:{digest}"


def classify_org_type(name: str) -> str:
    n = (name or "").upper()
    if "CATAPULT" in n:
        return "catapult"
    if any(k in n for k in ("UNIVERSITY", "COLLEGE", "INSTITUTE")):
        return "academic"
    if any(
        k in n
        for k in ("COUNCIL", "AUTHORITY", "GOVERNMENT", "DEPARTMENT", "AGENCY")
    ):
        return "public_sector"
    return "industry"


def year_from_value(v: date | None) -> int | None:
    if v is None:
        return None
    if hasattr(v, "year"):
        return int(v.year)
    s = str(v)[:4]
    return int(s) if s.isdigit() else None


def main() -> None:
    print("Connecting...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute(ENSURE_SQL)
    conn.commit()
    print("Schema ready.", flush=True)

    cur.execute(
        """
        SELECT
          lead_org_name AS name,
          COUNT(*)::int AS project_count,
          COALESCE(SUM(funding_amount), 0)::numeric AS total_funding,
          MIN(start_date) AS first_start,
          MAX(COALESCE(end_date, start_date)) AS last_end,
          AVG(transport_relevance_score)::numeric AS avg_transport_relevance
        FROM atlas.projects
        WHERE lead_org_name IS NOT NULL
        GROUP BY lead_org_name
        ORDER BY lead_org_name
        """
    )
    base_rows = cur.fetchall()

    cur.execute(
        """
        SELECT lead_org_name AS name,
               array_remove(array_agg(DISTINCT lead_funder ORDER BY lead_funder), NULL) AS funders
        FROM atlas.projects
        WHERE lead_org_name IS NOT NULL AND lead_funder IS NOT NULL
        GROUP BY lead_org_name
        """
    )
    funders_map = {r[0]: r[1] or [] for r in cur.fetchall()}

    cur.execute(
        """
        SELECT p.lead_org_name AS name,
               COALESCE(
                 array_agg(DISTINCT t ORDER BY t) FILTER (WHERE t IS NOT NULL AND btrim(t) <> ''),
                 ARRAY[]::text[]
               ) AS research_topics
        FROM atlas.projects p
        CROSS JOIN LATERAL unnest(COALESCE(p.research_topics, ARRAY[]::text[])) AS t
        WHERE p.lead_org_name IS NOT NULL
        GROUP BY p.lead_org_name
        """
    )
    topics_map = {r[0]: list(r[1] or []) for r in cur.fetchall()}

    upsert_sql = """
    INSERT INTO atlas.organisations (
      gtr_id, name, org_type, project_count, total_funding, funders, research_topics,
      first_project_year, last_project_year, avg_transport_relevance
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (name) DO UPDATE SET
      org_type = EXCLUDED.org_type,
      project_count = EXCLUDED.project_count,
      total_funding = EXCLUDED.total_funding,
      funders = EXCLUDED.funders,
      research_topics = EXCLUDED.research_topics,
      first_project_year = EXCLUDED.first_project_year,
      last_project_year = EXCLUDED.last_project_year,
      avg_transport_relevance = EXCLUDED.avg_transport_relevance
    """

    n = 0
    for row in base_rows:
        name, project_count, total_funding, first_start, last_end, avg_tr = row
        org_type = classify_org_type(name)
        funders = funders_map.get(name, [])
        topics = topics_map.get(name, [])
        y0 = year_from_value(first_start)
        y1 = year_from_value(last_end)
        cur.execute(
            upsert_sql,
            (
                surrogate_gtr_id(name),
                name,
                org_type,
                project_count,
                total_funding,
                funders,
                topics,
                y0,
                y1,
                avg_tr,
            ),
        )
        n += 1

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM atlas.organisations")
    total = cur.fetchone()[0]
    cur.close()
    conn.close()

    print(f"Upserted {n} organisation rows.", flush=True)
    print(f"atlas.organisations COUNT(*) = {total}", flush=True)
    if total != EXPECTED_ORG_COUNT:
        print(
            f"WARNING: expected {EXPECTED_ORG_COUNT} rows, got {total}.",
            flush=True,
        )


if __name__ == "__main__":
    main()
