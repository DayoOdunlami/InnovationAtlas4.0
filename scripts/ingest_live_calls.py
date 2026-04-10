"""
Ingest Horizon Europe search results into atlas.live_calls: embed, UMAP
coordinates via a pre-fitted reducer (scripts/umap_model.pkl), upsert by
source_url.

Prerequisite: run scripts/umap_atlas.py once so scripts/umap_model.pkl exists.

Env:
  DATABASE_URL
  OPENAI_API_KEY
  REACT_APP_SOLR_KEY or EU_HORIZON_SEARCH_API_KEY — Search API key (query param apiKey)
"""

from __future__ import annotations

import html
import os
import pickle
import re
from datetime import date, datetime
from pathlib import Path

import numpy as np
import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
API_KEY = os.environ.get("REACT_APP_SOLR_KEY") or os.environ.get(
    "EU_HORIZON_SEARCH_API_KEY"
)
if not API_KEY:
    raise SystemExit(
        "Set REACT_APP_SOLR_KEY or EU_HORIZON_SEARCH_API_KEY for the Horizon search API."
    )

SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
SEARCH_TEXT = "transport autonomous decarbonisation"
PAGE_SIZE = 50
MODEL = "text-embedding-3-small"
SCRIPT_DIR = Path(__file__).resolve().parent
UMAP_MODEL_PATH = SCRIPT_DIR / "umap_model.pkl"

TAG_RE = re.compile(r"<[^>]+>")


def strip_html(s: str) -> str:
    t = TAG_RE.sub(" ", s)
    return html.unescape(" ".join(t.split())).strip()


def first_meta_list(meta: dict, key: str) -> list:
    v = meta.get(key)
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def parse_deadlines(meta: dict) -> list[datetime]:
    out: list[datetime] = []
    for s in first_meta_list(meta, "deadlineDate"):
        if not s:
            continue
        try:
            out.append(datetime.fromisoformat(str(s).replace("Z", "+00:00")))
        except ValueError:
            continue
    return out


def deadline_status(deadlines: list[datetime]) -> tuple[date | None, str]:
    today = date.today()
    if not deadlines:
        return None, "open"
    latest = max(deadlines)
    d = latest.date()
    if d < today:
        return d, "closed"
    return d, "open"


def scale_axis(val: float, mn: float, mx: float) -> float:
    if mx == mn:
        return 50.0
    v = (val - mn) / (mx - mn) * 100.0
    return float(max(0.0, min(100.0, v)))


def ensure_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS atlas.live_calls (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title TEXT,
                funder TEXT,
                deadline DATE,
                funding_amount TEXT,
                description TEXT,
                source_url TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                embedding vector(1536),
                viz_x NUMERIC,
                viz_y NUMERIC,
                scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cur.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS live_calls_source_url_key
            ON atlas.live_calls (source_url)
            """
        )
    conn.commit()


def fetch_search_page(page_number: int) -> dict:
    r = requests.post(
        SEARCH_URL,
        params={
            "apiKey": API_KEY,
            "text": SEARCH_TEXT,
            "pageSize": str(PAGE_SIZE),
            "pageNumber": str(page_number),
        },
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def row_from_result(item: dict) -> dict | None:
    url = item.get("url")
    if not url:
        return None
    meta = item.get("metadata") or {}
    titles = first_meta_list(meta, "callTitle")
    ident = first_meta_list(meta, "identifier")
    title = item.get("title") or (titles[0] if titles else None)
    if not title and ident:
        title = ident[0]
    if not title:
        title = (item.get("summary") or "Live call")[:200]

    summary = item.get("summary") or strip_html(item.get("content") or "")
    desc = summary
    bo = first_meta_list(meta, "budgetOverview")
    funding = None
    if bo:
        funding = str(bo[0])[:2000]

    deadlines = parse_deadlines(meta)
    deadline_d, status = deadline_status(deadlines)

    return {
        "title": str(title)[:2000],
        "funder": "European Commission / Horizon Europe",
        "deadline": deadline_d,
        "funding_amount": funding,
        "description": desc[:8000] if desc else None,
        "source_url": str(url)[:4000],
        "status": status,
        "embed_text": f"{title}. {summary}. {' '.join(ident)}".strip(),
    }


def main() -> None:
    if not UMAP_MODEL_PATH.is_file():
        raise SystemExit(
            f"Missing {UMAP_MODEL_PATH}. Run scripts/umap_atlas.py first."
        )

    with open(UMAP_MODEL_PATH, "rb") as f:
        bundle = pickle.load(f)

    reducer = bundle["reducer"] if isinstance(bundle, dict) else bundle
    raw_bounds = (
        bundle.get("raw_bounds")
        if isinstance(bundle, dict)
        else None
    )
    if not raw_bounds:
        raise SystemExit(
            "umap_model.pkl must contain raw_bounds; re-run scripts/umap_atlas.py."
        )

    print("Connecting to DB...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    ensure_table(conn)

    print("Fetching search page 1...", flush=True)
    page1 = fetch_search_page(1)
    results = list(page1.get("results") or [])
    total_pages = int(page1.get("totalPages") or page1.get("pageNumber") or 1)
    if total_pages < 1:
        total_pages = 1
    print(
        f"totalResults={page1.get('totalResults')} pageSize={page1.get('pageSize')} "
        f"totalPages={total_pages}",
        flush=True,
    )

    rows: list[dict] = []
    for item in results:
        r = row_from_result(item)
        if r:
            rows.append(r)

    if not rows:
        print("No rows to ingest.")
        conn.close()
        return

    client = OpenAI(api_key=OPENAI_API_KEY)
    texts = [r["embed_text"] for r in rows]
    print(f"Embedding {len(texts)} calls...", flush=True)
    emb_resp = client.embeddings.create(input=texts, model=MODEL)
    emb = np.array(
        [emb_resp.data[i].embedding for i in range(len(emb_resp.data))],
        dtype=np.float64,
    )
    coords = reducer.transform(emb)
    x_min = raw_bounds["x_min"]
    x_max = raw_bounds["x_max"]
    y_min = raw_bounds["y_min"]
    y_max = raw_bounds["y_max"]

    upserts = []
    for i, r in enumerate(rows):
        vx = scale_axis(float(coords[i, 0]), x_min, x_max)
        vy = scale_axis(float(coords[i, 1]), y_min, y_max)
        vec = str(emb_resp.data[i].embedding)
        upserts.append(
            (
                r["title"],
                r["funder"],
                r["deadline"],
                r["funding_amount"],
                r["description"],
                r["source_url"],
                r["status"],
                vec,
                vx,
                vy,
            )
        )

    print("Upserting into atlas.live_calls...", flush=True)
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO atlas.live_calls (
                title, funder, deadline, funding_amount, description,
                source_url, status, embedding, viz_x, viz_y, scraped_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s::vector, %s, %s, NOW()
            )
            ON CONFLICT (source_url) DO UPDATE SET
                title = EXCLUDED.title,
                funder = EXCLUDED.funder,
                deadline = EXCLUDED.deadline,
                funding_amount = EXCLUDED.funding_amount,
                description = EXCLUDED.description,
                status = EXCLUDED.status,
                embedding = EXCLUDED.embedding,
                viz_x = EXCLUDED.viz_x,
                viz_y = EXCLUDED.viz_y,
                scraped_at = NOW()
            """,
            upserts,
            page_size=20,
        )
    conn.commit()
    conn.close()
    print(f"Upserted {len(upserts)} live call(s).", flush=True)


if __name__ == "__main__":
    main()
