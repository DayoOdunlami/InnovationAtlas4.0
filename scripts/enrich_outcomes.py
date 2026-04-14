"""
Fetch GtR outcomes (publications, further funding, impact summaries) for the
most transport-relevant projects that are not yet in atlas.project_outcomes.

Selects up to 100 projects with no outcome rows, highest transport_relevance_score
first. One-second pause after each HTTP request.

Expects atlas.project_outcomes with columns:
  id, project_id, gtr_id, outcome_type, title, description, year, sector,
  embedding, raw_json, ingested_at
(Does not CREATE or ALTER the table.)

Env: DATABASE_URL
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]
GtR_BASE = "https://gtr.ukri.org/gtr/api"
HEADERS = {"Accept": "application/vnd.rcuk.gtr.json-v7"}
SLEEP_S = 1.0
TOP_N = 100

OUTCOME_ENDPOINTS: list[tuple[str, str, str]] = [
    ("publications", "publication", "publication"),
    ("furtherfundings", "futherfunding", "further_funding"),
    ("impactsummaries", "impactSummary", "impact_summary"),
]

INSERT_SQL = """
INSERT INTO atlas.project_outcomes (
    project_id,
    gtr_id,
    outcome_type,
    title,
    description,
    year,
    sector,
    embedding,
    raw_json,
    ingested_at
)
VALUES (
    %(project_id)s,
    %(gtr_id)s,
    %(outcome_type)s,
    %(title)s,
    %(description)s,
    %(year)s,
    %(sector)s,
    NULL,
    %(raw_json)s::jsonb,
    NOW()
)
"""


def normalise_items(payload: dict, item_key: str) -> list[Any]:
    raw = payload.get(item_key)
    if raw is None:
        return []
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, list):
        return raw
    return []


def ms_to_year(ms: Any) -> int | None:
    if ms is None or ms == "":
        return None
    try:
        n = int(ms)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return datetime.fromtimestamp(n / 1000, tz=timezone.utc).year


def outcome_row_id(item: dict[str, Any]) -> str | None:
    x = item.get("id") or item.get("outcomeid")
    return str(x) if x else None


def map_publication(item: dict[str, Any]) -> tuple[str | None, str | None, int | None, str | None]:
    title = item.get("title") or None
    desc = item.get("abstractText") or item.get("otherInformation") or None
    year = ms_to_year(item.get("datePublished"))
    sector = item.get("type") or None
    return title, desc, year, sector


def map_further_funding(item: dict[str, Any]) -> tuple[str | None, str | None, int | None, str | None]:
    title = item.get("title") or None
    desc = item.get("description") or item.get("narrative") or None
    year = ms_to_year(item.get("start")) or ms_to_year(item.get("end"))
    sector = item.get("sector") or None
    return title, desc, year, sector


def map_impact_summary(item: dict[str, Any]) -> tuple[str | None, str | None, int | None, str | None]:
    title = item.get("title") or item.get("summary") or None
    desc = item.get("description") or item.get("summary") or None
    fy = item.get("firstYearOfImpact")
    year: int | None = None
    if isinstance(fy, int) and fy > 0:
        year = fy
    elif fy is not None:
        try:
            y = int(fy)
            year = y if y > 0 else None
        except (TypeError, ValueError):
            year = None
    sector = item.get("sector") or None
    return title, desc, year, sector


MAPPERS = {
    "publication": map_publication,
    "further_funding": map_further_funding,
    "impact_summary": map_impact_summary,
}


def fetch_outcome_pages(gtr_id: str, path_suffix: str, item_key: str) -> list[Any]:
    """GET all pages for /projects/{gtr_id}/outcomes/{path_suffix}."""
    all_items: list[Any] = []
    page = 1
    while True:
        url = f"{GtR_BASE}/projects/{gtr_id}/outcomes/{path_suffix}"
        r = requests.get(
            url,
            headers=HEADERS,
            params={"fetchSize": 100, "page": page},
            timeout=90,
        )
        time.sleep(SLEEP_S)
        r.raise_for_status()
        data = r.json()
        items = normalise_items(data, item_key)
        all_items.extend(items)
        total_pages = int(data.get("totalPages") or 1)
        print(
            f"    {path_suffix} page {page}/{total_pages} (+{len(items)})",
            flush=True,
        )
        if page >= total_pages:
            break
        page += 1
    return all_items


def insert_outcome_items(
    conn,
    project_id: object,
    outcome_type: str,
    items: list[Any],
) -> int:
    mapper = MAPPERS[outcome_type]
    rows: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        gid = outcome_row_id(item)
        if not gid:
            continue
        title, description, year, sector = mapper(item)
        rows.append(
            {
                "project_id": project_id,
                "gtr_id": gid,
                "outcome_type": outcome_type,
                "title": title,
                "description": description,
                "year": year,
                "sector": sector,
                "raw_json": json.dumps(item),
            }
        )
    if not rows:
        return 0
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, INSERT_SQL, rows, page_size=50)
    conn.commit()
    return len(rows)


def main() -> None:
    print("Connecting...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.id, p.gtr_id
            FROM atlas.projects p
            WHERE p.gtr_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM atlas.project_outcomes o
                  WHERE o.project_id = p.id
              )
            ORDER BY p.transport_relevance_score DESC NULLS LAST, p.id
            LIMIT %s
            """,
            (TOP_N,),
        )
        candidates = cur.fetchall()

    print(f"Projects to enrich (no outcomes yet, top {TOP_N} by score): {len(candidates)}", flush=True)

    for i, (project_id, gtr_id) in enumerate(candidates, start=1):
        print(f"[{i}/{len(candidates)}] gtr_id={gtr_id}", flush=True)
        for path_suffix, item_key, outcome_type in OUTCOME_ENDPOINTS:
            try:
                items = fetch_outcome_pages(str(gtr_id), path_suffix, item_key)
                n = insert_outcome_items(conn, project_id, outcome_type, items)
                print(f"  {outcome_type}: inserted {n} row(s) ({len(items)} from API)", flush=True)
            except Exception as e:
                print(f"  {outcome_type}: ERROR {e}", flush=True)
                conn.rollback()

    conn.close()
    print("Done.", flush=True)


if __name__ == "__main__":
    main()
