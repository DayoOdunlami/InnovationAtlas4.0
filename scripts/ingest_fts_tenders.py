"""
Ingest UK Find a Tender (FTS) OCDS notices into atlas.live_calls.

Three-layer pipeline:
  L1 — Broad pre-filter (authority OR keyword in title / description head).
  L2 — claude-haiku-4-5 classifies: relevant | borderline | irrelevant (+ reason).
  L3 — OpenAI text-embedding-3-small only for relevant + borderline (audit-only for irrelevant).

Pagination: sliding-window via updatedTo (~100 releases/page), MAX_PAGES=30.
Timeout 30s, 3 retries with exponential backoff.

ON CONFLICT (source_url): refresh status/last_synced; preserve existing relevance_tag
when already set (COALESCE). Preserve existing embedding when set unless EXCLUDED has new.

Env:
  DATABASE_URL
  OPENAI_API_KEY
  ANTHROPIC_API_KEY
"""

from __future__ import annotations

import os
import pickle
import sys
import time
from datetime import date, datetime
from pathlib import Path
from typing import Optional

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
FTS_BASE = "https://www.find-tender.service.gov.uk"
OCDS_URL = f"{FTS_BASE}/api/1.0/ocdsReleasePackages"
HEADERS = {
    "User-Agent": "InnovationAtlas/4.0 (atlas@cpc.org.uk)",
    "Accept": "application/json",
}

MAX_PAGES = 30
HAIKU_MODEL = os.environ.get("ANTHROPIC_HAIKU_MODEL", "claude-haiku-4-5")
EMBED_MODEL = "text-embedding-3-small"

BROAD_RELEVANT_AUTHORITIES = [
    "network rail",
    "national highways",
    "transport for london",
    "department for transport",
    "civil aviation authority",
    "maritime and coastguard",
    "homes england",
    "innovate uk",
    "ukri",
    "catapult",
    "combined authority",
    "tfl",
    "highways england",
    "great british railways",
    "office of rail",
    "dft",
    "department of transport",
]

BROAD_KEYWORDS = [
    "rail",
    "train",
    "tram",
    "metro",
    "aviation",
    "aircraft",
    "drone",
    "uas",
    "unmanned",
    "maritime",
    "vessel",
    "ship",
    "port",
    "harbour",
    "autonomous",
    "electric vehicle",
    "charging infrastructure",
    "hydrogen",
    "decarbonisation",
    "zero emission",
    "digital twin",
    "smart infrastructure",
    "electrification",
    "transport",
    "highway",
    "road safety",
    "bridge inspection",
    "tunnel",
    "signalling",
    "traffic management",
    "fleet management",
    "mobility",
    "logistics",
    "freight",
    "geospatial",
    "lidar",
    "sensor fusion",
    "v2x",
    "connected vehicle",
    "data platform",
    "renewable energy",
]

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

UPSERT_SQL = """
INSERT INTO atlas.live_calls (
    title, funder, deadline, funding_amount, description,
    source_url, status, source, relevance_tag, relevance_reason,
    embedding, viz_x, viz_y, scraped_at, last_synced_at
) VALUES (
    %s, %s, %s, %s, %s, %s, %s, 'find_a_tender', %s, %s, %s::vector, %s, %s, NOW(), NOW()
)
ON CONFLICT (source_url) DO UPDATE SET
    status            = EXCLUDED.status,
    last_synced_at    = NOW(),
    relevance_tag     = COALESCE(atlas.live_calls.relevance_tag, EXCLUDED.relevance_tag),
    relevance_reason  = COALESCE(atlas.live_calls.relevance_reason, EXCLUDED.relevance_reason),
    embedding         = COALESCE(atlas.live_calls.embedding, EXCLUDED.embedding),
    viz_x             = COALESCE(atlas.live_calls.viz_x, EXCLUDED.viz_x),
    viz_y             = COALESCE(atlas.live_calls.viz_y, EXCLUDED.viz_y),
    title             = EXCLUDED.title,
    funder            = EXCLUDED.funder,
    deadline          = EXCLUDED.deadline,
    funding_amount    = EXCLUDED.funding_amount,
    description       = EXCLUDED.description
"""


def scale_axis(val: float, mn: float, mx: float) -> float:
    if mx == mn:
        return 50.0
    v = (val - mn) / (mx - mn) * 100.0
    return float(max(0.0, min(100.0, v)))


def parse_date_str(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    raw = str(s).strip()
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def layer1_pass(funder: str, title: str, description: str) -> bool:
    f = (funder or "").lower()
    if any(a in f for a in BROAD_RELEVANT_AUTHORITIES):
        return True
    head = ((title or "") + " " + (description or "")[:500]).lower()
    return any(kw in head for kw in BROAD_KEYWORDS)


def classify_tender(
    client: Anthropic, title: str, funder: str, description: Optional[str]
) -> tuple[str, str]:
    user_msg = (
        f"Title: {title}\nFunder: {funder}\n"
        f"Description: {(description or '')[:400] if description else 'No description'}"
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
    tag = "borderline"
    if lines:
        first = lines[0].lower()
        for t in ("relevant", "borderline", "irrelevant"):
            if first.startswith(t):
                tag = t
                break
    reason = lines[1][:500] if len(lines) > 1 else ""
    return tag, reason


def fetch_page(updated_to: Optional[str] = None, max_retries: int = 3) -> dict:
    params: dict = {}
    if updated_to:
        params["updatedTo"] = updated_to
    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            resp = requests.get(OCDS_URL, params=params, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.Timeout as exc:
            last_exc = exc
            wait = 5 * (2**attempt)
            print(f"  Timeout (attempt {attempt + 1}/{max_retries}), wait {wait}s...", flush=True)
            time.sleep(wait)
        except requests.exceptions.RequestException as exc:
            last_exc = exc
            wait = 5 * (2**attempt)
            print(f"  Request error ({exc}), wait {wait}s...", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch FTS page updatedTo={updated_to!r}") from last_exc


def process_release(rel: dict) -> Optional[dict]:
    release_id = rel.get("id", "") or ""
    buyer_name = (rel.get("buyer") or {}).get("name", "") or ""
    tender = rel.get("tender") or {}
    title = (tender.get("title") or "").strip()
    description = (tender.get("description") or "").strip()[:500]

    if not layer1_pass(buyer_name, title, description):
        return None

    period = tender.get("tenderPeriod") or {}
    deadline = parse_date_str(period.get("endDate"))
    tender_status = tender.get("status", "")
    today = date.today()
    if tender_status == "active" and (deadline is None or deadline >= today):
        status = "open"
    else:
        status = "closed"

    value = tender.get("value") or {}
    amount = value.get("amount")
    currency = value.get("currency", "GBP")
    funding = None
    if amount is not None:
        symbol = "£" if currency == "GBP" else str(currency)
        try:
            funding = f"{symbol}{float(amount):,.0f}"
        except (TypeError, ValueError):
            funding = str(amount)[:500]

    source_url = f"{FTS_BASE}/Notice/{release_id}"
    return {
        "title": (title or release_id)[:2000],
        "funder": buyer_name[:1000] if buyer_name else None,
        "deadline": deadline,
        "funding_amount": funding,
        "description": description if description else None,
        "source_url": source_url[:4000],
        "status": status,
    }


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SystemExit("ANTHROPIC_API_KEY is required for FTS Haiku classification.")

    conn = psycopg2.connect(DB_URL, sslmode="require")
    ensure_live_calls_columns(conn)

    umap_path = SCRIPT_DIR / "umap_model.pkl"
    reducer = None
    raw_bounds: dict | None = None
    if umap_path.is_file():
        with open(umap_path, "rb") as f:
            bundle = pickle.load(f)
        reducer = bundle["reducer"] if isinstance(bundle, dict) else bundle
        raw_bounds = bundle.get("raw_bounds") if isinstance(bundle, dict) else None
    else:
        print("Warning: umap_model.pkl missing — viz_x/viz_y will be NULL.", flush=True)

    anthropic = Anthropic(api_key=api_key)
    openai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    stats = {
        "fetched": 0,
        "l1": 0,
        "relevant": 0,
        "borderline": 0,
        "irrelevant": 0,
        "upserts": 0,
        "new_embeddings": 0,
    }

    updated_to: Optional[str] = None
    page_num = 0

    while page_num < MAX_PAGES:
        page_num += 1
        label = f"updatedTo={updated_to}" if updated_to else "latest"
        print(f"Page {page_num}/{MAX_PAGES} ({label})...", flush=True)
        try:
            data = fetch_page(updated_to=updated_to)
        except Exception as exc:
            print(f"  Abort pagination: {exc}", flush=True)
            break

        releases = data.get("releases") or []
        stats["fetched"] += len(releases)
        if not releases:
            break

        batch_rows: list[tuple] = []
        for rel in releases:
            base = process_release(rel)
            if base is None:
                continue
            stats["l1"] += 1

            tag, reason = classify_tender(
                anthropic,
                base["title"],
                base["funder"] or "",
                base["description"],
            )
            if tag in ("relevant", "borderline", "irrelevant"):
                stats[tag] += 1

            emb_vec: str | None = None
            vx: float | None = None
            vy: float | None = None
            if tag in ("relevant", "borderline"):
                text = f"{base['title']} {(base['description'] or '')}".strip()[:8000]
                er = openai.embeddings.create(input=[text], model=EMBED_MODEL)
                vec = er.data[0].embedding
                emb_vec = str(vec)
                stats["new_embeddings"] += 1
                if reducer is not None and raw_bounds:
                    arr = np.array([vec], dtype=np.float64)
                    coords = reducer.transform(arr)
                    vx = scale_axis(
                        float(coords[0, 0]), raw_bounds["x_min"], raw_bounds["x_max"]
                    )
                    vy = scale_axis(
                        float(coords[0, 1]), raw_bounds["y_min"], raw_bounds["y_max"]
                    )

            batch_rows.append(
                (
                    base["title"],
                    base["funder"],
                    base["deadline"],
                    base["funding_amount"],
                    base["description"],
                    base["source_url"],
                    base["status"],
                    tag,
                    reason[:2000] if reason else None,
                    emb_vec,
                    vx,
                    vy,
                )
            )

        if batch_rows:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, UPSERT_SQL, batch_rows, page_size=50)
            conn.commit()
            stats["upserts"] += len(batch_rows)

        dates = [r.get("date", "") for r in releases if r.get("date")]
        if not dates:
            break
        updated_to = min(dates)
        if len(releases) < 100:
            break
        time.sleep(1.0)

    print("\n" + "=" * 55, flush=True)
    print("COMPLETE", flush=True)
    print(f"Total notices fetched     : {stats['fetched']}", flush=True)
    print(f"Passed Layer 1            : {stats['l1']}", flush=True)
    print(f"Haiku relevant            : {stats.get('relevant', 0)}", flush=True)
    print(f"Haiku borderline          : {stats.get('borderline', 0)}", flush=True)
    print(f"Haiku irrelevant          : {stats.get('irrelevant', 0)}", flush=True)
    print(f"Inserted/updated (rows)   : {stats['upserts']}", flush=True)
    print(f"New embeddings generated  : {stats['new_embeddings']}", flush=True)
    print("=" * 55, flush=True)

    conn.close()


if __name__ == "__main__":
    main()
