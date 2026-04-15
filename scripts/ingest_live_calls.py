"""
Ingest Horizon Europe search results into atlas.live_calls: embed, UMAP
coordinates via scripts/umap_model.pkl, upsert by source_url.

Fetches pages HORIZON_PAGE_START..HORIZON_PAGE_END (default 6-20) so page 1-5
wide runs stay incremental. Skips URLs already present in atlas.live_calls.

New rows: optional Haiku relevance for short / topic-code titles; otherwise
auto-tag relevant. All new rows are embedded (including borderline).

Prerequisite: scripts/umap_model.pkl (run scripts/umap_atlas.py once).

Env:
  DATABASE_URL
  OPENAI_API_KEY
  ANTHROPIC_API_KEY (for Haiku when title needs classification)
  REACT_APP_SOLR_KEY or EU_HORIZON_SEARCH_API_KEY
"""

from __future__ import annotations

import html
import math
import os
import pickle
import re
import sys
import time as _time
from datetime import date, datetime
from pathlib import Path

import numpy as np
import psycopg2
import psycopg2.extras
import requests
from anthropic import Anthropic
from dotenv import load_dotenv
from openai import OpenAI

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from live_calls_columns import ensure_live_calls_columns  # noqa: E402

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
SEARCH_TEXT = (
    "transport autonomous mobility built environment decarbonisation "
    "infrastructure clean energy"
)
PAGE_SIZE = 50
HORIZON_PAGE_START = int(os.environ.get("HORIZON_PAGE_START", "6"))
HORIZON_PAGE_END = int(os.environ.get("HORIZON_PAGE_END", "20"))
MODEL = "text-embedding-3-small"
HAIKU_MODEL = os.environ.get("ANTHROPIC_HAIKU_MODEL", "claude-haiku-4-5")

UMAP_MODEL_PATH = SCRIPT_DIR / "umap_model.pkl"

TAG_RE = re.compile(r"<[^>]+>")

HORIZON_TITLE_NEEDS_AI = re.compile(
    r"^(MOBILITY|TRANSPORT|HORIZON|CL\d+|[A-Z0-9][A-Z0-9\-]{0,22})$",
    re.IGNORECASE,
)

CLASSIFIER_SYSTEM = """You classify UK public sector tender notices for relevance to transport \
innovation, autonomous systems, clean energy, and advanced engineering. \
Transport innovation includes: rail, aviation, maritime, highways, autonomous vehicles, \
drones/UAS, electrification, digital infrastructure, smart cities, decarbonisation, \
and related technology R&D and procurement. \
Operational procurement (housing maintenance, food safety, laundry, fire alarm \
servicing, insurance compliance, catering, cleaning) is irrelevant even if from a \
transport body. \
Reply with exactly one of: relevant, borderline, irrelevant \
Then on a new line, one sentence explaining why (max 15 words)."""


TITLE_FIX_SQL = """
UPDATE atlas.live_calls
SET title = LEFT(REGEXP_REPLACE(description, '[[:space:]]+', ' ', 'g'), 80)
WHERE source = 'horizon_europe'
  AND (LENGTH(title) < 20 OR title ~ '^[A-Z0-9-]+$')
  AND description IS NOT NULL
  AND LENGTH(description) > 20
"""


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
    ensure_live_calls_columns(conn)


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


def extract_funding_amount(meta: dict) -> str | None:
    import json as _json

    bo = first_meta_list(meta, "budgetOverview")
    if not bo:
        return None

    total = 0.0
    for entry in bo:
        try:
            parsed = _json.loads(str(entry)) if isinstance(entry, str) else entry
        except Exception:
            continue
        bmap = parsed.get("budgetTopicActionMap") if isinstance(parsed, dict) else None
        if not bmap or not isinstance(bmap, dict):
            continue
        for actions in bmap.values():
            if not isinstance(actions, list):
                continue
            for action in actions:
                if not isinstance(action, dict):
                    continue
                year_map = action.get("budgetYearMap", {})
                if isinstance(year_map, dict):
                    for v in year_map.values():
                        try:
                            total += float(v)
                        except (TypeError, ValueError):
                            pass

    if total <= 0:
        return None
    if total >= 1_000_000:
        return f"\u20ac{round(total / 1_000_000)}m"
    if total >= 1_000:
        return f"\u20ac{round(total / 1_000)}k"
    return f"\u20ac{round(total)}"


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
    funding = extract_funding_amount(meta)

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


def title_needs_haiku(title: str) -> bool:
    t = (title or "").strip()
    if len(t) < 20:
        return True
    return bool(HORIZON_TITLE_NEEDS_AI.match(t))


def classify_horizon(client: Anthropic | None, title: str, funder: str, desc: str | None) -> tuple[str, str]:
    if client is None:
        return "relevant", "Horizon Europe transport search (no Haiku key)"
    user_msg = (
        f"Title: {title}\nFunder: {funder}\n"
        f"Description: {(desc or '')[:400] if desc else 'No description'}"
    )
    msg = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=80,
        system=CLASSIFIER_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = ""
    if msg.content and msg.content[0].type == "text":
        text = msg.content[0].text.strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    tag = "relevant"
    if lines:
        first = lines[0].lower()
        for t in ("relevant", "borderline", "irrelevant"):
            if first.startswith(t):
                tag = t
                break
    reason = lines[1][:500] if len(lines) > 1 else ""
    return tag, reason


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

    with conn.cursor() as cur:
        cur.execute("SELECT source_url FROM atlas.live_calls WHERE source_url IS NOT NULL")
        existing_urls = {r[0] for r in cur.fetchall()}

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    anthropic = Anthropic(api_key=anthropic_key) if anthropic_key else None

    lo = max(1, HORIZON_PAGE_START)
    hi = max(lo, HORIZON_PAGE_END)
    print(
        f"Fetching Horizon pages {lo}-{hi} (pageSize={PAGE_SIZE})...",
        flush=True,
    )

    all_results: list[dict] = []
    for page_num in range(lo, hi + 1):
        _time.sleep(1.0 if page_num > lo else 0)
        print(f"  Page {page_num}/{hi}...", flush=True)
        try:
            page_data = fetch_search_page(page_num)
            all_results.extend(page_data.get("results") or [])
        except Exception as exc:
            print(f"  Warning: page {page_num} failed ({exc}), stopping.", flush=True)
            break

    print(f"Total API results collected: {len(all_results)}", flush=True)

    rows: list[dict] = []
    for item in all_results:
        r = row_from_result(item)
        if not r or r["source_url"] in existing_urls:
            continue
        if title_needs_haiku(r["title"]):
            tag, reason = classify_horizon(
                anthropic,
                r["title"],
                r["funder"] or "",
                r.get("description") or "",
            )
            _time.sleep(0.05)
        else:
            tag, reason = "relevant", "Curated Horizon Europe transport search"
        r["relevance_tag"] = tag
        r["relevance_reason"] = reason[:2000] if reason else None
        rows.append(r)

    print(f"New Horizon calls to insert: {len(rows)}", flush=True)

    if not rows:
        conn.close()
        print("Nothing new to ingest.")
        return

    client = OpenAI(api_key=OPENAI_API_KEY)
    texts = [r["embed_text"] for r in rows]
    print(f"Embedding {len(texts)} new calls...", flush=True)
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
                r["relevance_tag"],
                r["relevance_reason"],
            )
        )

    print("Inserting new calls into atlas.live_calls...", flush=True)
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO atlas.live_calls (
                title, funder, deadline, funding_amount, description,
                source_url, status, embedding, viz_x, viz_y, scraped_at,
                source, relevance_tag, relevance_reason, last_synced_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s::vector, %s, %s, NOW(),
                'horizon_europe', %s, %s, NOW()
            )
            ON CONFLICT (source_url) DO NOTHING
            """,
            upserts,
            page_size=20,
        )
        cur.execute(TITLE_FIX_SQL)
    conn.commit()

    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM atlas.live_calls WHERE source = 'horizon_europe'"
        )
        hz = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM atlas.live_calls")
        total_in_db = cur.fetchone()[0]

    conn.close()
    print(f"Inserted (attempted) {len(upserts)} new row(s).", flush=True)
    print(f"Horizon Europe rows in DB: {hz}", flush=True)
    print(f"Total atlas.live_calls rows: {total_in_db}", flush=True)


if __name__ == "__main__":
    main()
