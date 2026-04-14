"""
Ingest UK government procurement notices from Find a Tender (FTS) into
atlas.live_calls using the public OCDS API — no authentication required.

Base URL: https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages

Pagination: sliding-window via the 'updatedTo' query parameter.
Each page fetches 100 releases published before the oldest date from the
previous page. This avoids the cursor-based pagination endpoint which
consistently times out beyond page 1.

FILTERING (applied in order):
  1. EXCLUDE: title contains any EXCLUDE_KEYWORDS term  → skip
  2. PRIMARY:   buyer.name contains a whitelisted authority → include
  3. SECONDARY: title OR description contains a specialist keyword → include

Storage:
  - source        = 'find_a_tender'
  - status        = 'open'  if tender.status='active' AND deadline >= today
                   'closed' otherwise
  - source_url    = https://www.find-tender.service.gov.uk/Notice/{release.id}
  ON CONFLICT (source_url) DO UPDATE SET status, last_synced_at

Default run: fetch MAX_PAGES=20 pages (~2 000 notices).
Set MAX_PAGES=0 to fetch all available pages.

Env:
  DATABASE_URL — Supabase transaction pooler URI (port 6543, sslmode=require)
"""

from __future__ import annotations

import os
import time
from datetime import date, datetime
from typing import Optional

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]

FTS_BASE = "https://www.find-tender.service.gov.uk"
OCDS_URL = f"{FTS_BASE}/api/1.0/ocdsReleasePackages"
HEADERS = {
    "User-Agent": "InnovationAtlas/4.0 (atlas@cpc.org.uk)",
    "Accept": "application/json",
}

MAX_PAGES = 20  # set to 0 to fetch all pages

# FIX 1: Tightened — removed broad "UK Research and Innovation" / "UKRI"
# and replaced with specific Innovate UK entries only.
AUTHORITY_WHITELIST = [
    "network rail",
    "national highways",
    "department for transport",
    "transport for london",
    "civil aviation authority",
    "maritime and coastguard agency",
    "highways england",
    "hs2",
    "great british railways",
    "office of rail and road",
    "innovate uk",
    "ukri innovate uk",
    "homes england",
    "ministry of housing",
]

SPECIALIST_KEYWORDS = [
    "autonomous",
    "drone",
    "uas",
    "unmanned aerial",
    "inspection",
    "digital twin",
    "connected vehicle",
    "bvlos",
    "decarbonisation",
    "zero emission vessel",
    "hydrogen propulsion",
    "rail innovation",
    "smart infrastructure",
    "lidar",
    "sensor fusion",
    "port automation",
    "autonomous shipping",
    "v2x",
]

# FIX 2: Negative filter — reject notices whose title contains these terms
# regardless of authority or keyword match.
EXCLUDE_KEYWORDS = [
    "gym",
    "fitness",
    "sport equipment",
    "play equipment",
    "fuel",
    "bunker",
    "catering",
    "cleaning",
    "janitorial",
    "due diligence",
    "legal services",
    "accountancy",
    "landscaping",
    "grounds maintenance",
    "pest control",
]

INSERT_SQL = """
INSERT INTO atlas.live_calls (
    title, funder, deadline, funding_amount, description,
    source_url, status, source, scraped_at, last_synced_at
) VALUES (
    %s, %s, %s, %s, %s, %s, %s, 'find_a_tender', NOW(), NOW()
)
ON CONFLICT (source_url) DO UPDATE SET
    status         = EXCLUDED.status,
    last_synced_at = NOW()
"""


def _is_excluded(title: str) -> bool:
    """Return True if the notice title contains any exclusion keyword."""
    low = title.lower()
    return any(ex in low for ex in EXCLUDE_KEYWORDS)


def _matches_authority(buyer_name: str) -> bool:
    low = buyer_name.lower()
    return any(a in low for a in AUTHORITY_WHITELIST)


def _matches_keywords(text: str) -> bool:
    low = text.lower()
    return any(kw in low for kw in SPECIALIST_KEYWORDS)


def parse_date_str(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19], fmt[:len(fmt)])
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s).date() if "T" not in s else datetime.fromisoformat(s).date()
    except Exception:
        return None


def process_release(rel: dict) -> Optional[dict]:
    """Extract fields from one OCDS release. Returns None if should be skipped."""
    release_id = rel.get("id", "")
    buyer_name = (rel.get("buyer") or {}).get("name", "") or ""
    tender = rel.get("tender") or {}
    title = (tender.get("title") or "").strip()
    description = (tender.get("description") or "").strip()[:500]

    # FIX 2: Exclusion filter runs first — checked against title only
    if _is_excluded(title):
        return {"_excluded": True}

    # Apply inclusion filters
    by_authority = _matches_authority(buyer_name)
    by_keyword = _matches_keywords(f"{title} {description}")

    if not by_authority and not by_keyword:
        return None

    # Deadline
    period = tender.get("tenderPeriod") or {}
    deadline_str = period.get("endDate")
    deadline = parse_date_str(deadline_str)

    # Status
    tender_status = tender.get("status", "")
    today = date.today()
    if tender_status == "active" and (deadline is None or deadline >= today):
        status = "open"
    else:
        status = "closed"

    # Funding amount
    value = tender.get("value") or {}
    amount = value.get("amount")
    currency = value.get("currency", "GBP")
    funding = None
    if amount is not None:
        symbol = "£" if currency == "GBP" else currency
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
        "_by_authority": by_authority,
        "_by_keyword": by_keyword,
    }


def fetch_page(updated_to: Optional[str] = None, max_retries: int = 4) -> dict:
    """Fetch one page using the sliding-window updatedTo approach (FIX 3).
    
    Makes a fresh independent request to the base OCDS URL, optionally
    filtering to notices updated before `updated_to`. This avoids the
    cursor-based pagination endpoint that consistently times out.
    """
    params: dict = {}
    if updated_to:
        params["updatedTo"] = updated_to

    for attempt in range(max_retries):
        try:
            resp = requests.get(OCDS_URL, params=params, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.Timeout:
            wait = 5 * (2 ** attempt)
            print(
                f"  Timeout (attempt {attempt+1}/{max_retries}), "
                f"backing off {wait}s...",
                flush=True,
            )
            time.sleep(wait)
        except requests.exceptions.RequestException as exc:
            if attempt < max_retries - 1:
                wait = 5 * (2 ** attempt)
                print(f"  Request error ({exc}), retrying in {wait}s...", flush=True)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"Failed to fetch page (updatedTo={updated_to}) after {max_retries} attempts")


def main() -> None:
    print("Connecting to DB...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    conn.autocommit = False

    updated_to: Optional[str] = None  # sliding window anchor
    page_num = 0
    total_fetched = 0
    authority_matches = 0
    keyword_matches = 0
    excluded_count = 0
    rows_to_upsert: list[tuple] = []
    seen_urls: set[str] = set()

    while True:
        page_num += 1
        if MAX_PAGES > 0 and page_num > MAX_PAGES:
            print(f"Reached MAX_PAGES={MAX_PAGES}. Stopping.", flush=True)
            break

        label = f"updatedTo={updated_to}" if updated_to else "latest"
        print(
            f"Fetching page {page_num}/{MAX_PAGES if MAX_PAGES else '?'} ({label})...",
            flush=True,
        )
        try:
            data = fetch_page(updated_to=updated_to)
        except Exception as exc:
            print(f"  Error on page {page_num}: {exc}. Stopping.", flush=True)
            break

        releases = data.get("releases") or []
        total_fetched += len(releases)
        print(
            f"  Got {len(releases)} releases (total: {total_fetched}, "
            f"matched so far: {authority_matches + keyword_matches})",
            flush=True,
        )

        if not releases:
            print("  No releases returned. Stopping.", flush=True)
            break

        for rel in releases:
            row = process_release(rel)
            if row is None:
                continue
            if row.get("_excluded"):
                excluded_count += 1
                continue
            if row["source_url"] in seen_urls:
                continue
            seen_urls.add(row["source_url"])

            if row["_by_authority"]:
                authority_matches += 1
            elif row["_by_keyword"]:
                keyword_matches += 1

            rows_to_upsert.append((
                row["title"],
                row["funder"],
                row["deadline"],
                row["funding_amount"],
                row["description"],
                row["source_url"],
                row["status"],
            ))

        # Slide the window to just before the oldest release on this page
        dates = [r.get("date", "") for r in releases if r.get("date")]
        if not dates:
            print("  No date fields found. Stopping.", flush=True)
            break
        updated_to = min(dates)  # next page: everything older than this

        if len(releases) < 100:
            print("  Last page reached (fewer than 100 results).", flush=True)
            break

        time.sleep(1.0)  # polite delay between pages

    # Upsert
    print(f"\nUpserting {len(rows_to_upsert)} matched notices into atlas.live_calls...", flush=True)
    if rows_to_upsert:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, INSERT_SQL, rows_to_upsert, page_size=100)
        conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM atlas.live_calls WHERE source = 'find_a_tender'")
        total_fts = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM atlas.live_calls")
        grand_total = cur.fetchone()[0]

    conn.close()

    print(f"\n{'=' * 55}", flush=True)
    print("COMPLETE", flush=True)
    print(f"Total notices fetched        : {total_fetched}", flush=True)
    print(f"Matched authority whitelist  : {authority_matches}", flush=True)
    print(f"Matched keyword only         : {keyword_matches}", flush=True)
    print(f"Rejected by exclude filter   : {excluded_count}", flush=True)
    print(f"Total inserted/updated       : {len(rows_to_upsert)}", flush=True)
    print(f"Total find_a_tender in DB    : {total_fts}", flush=True)
    print(f"Grand total atlas.live_calls : {grand_total}", flush=True)
    print(f"{'=' * 55}", flush=True)


if __name__ == "__main__":
    main()
