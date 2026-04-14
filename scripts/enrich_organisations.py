"""
enrich_organisations.py

Enriches the top 50 organisations in atlas.projects with Companies House data.
Creates atlas.organisations table if it does not exist, then upserts matched records.

Usage:
  python scripts/enrich_organisations.py

Requires:
  - POSTGRES_URL (or DATABASE_URL) environment variable
  - psycopg2, requests, python-dotenv
"""

import os
import time
import sys
import re
import requests
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

POSTGRES_URL = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")
if not POSTGRES_URL:
    print("ERROR: POSTGRES_URL or DATABASE_URL environment variable not set.")
    sys.exit(1)

CH_BASE = "https://api.company-information.service.gov.uk/search/companies"
CH_API_KEY = os.environ.get("COMPANIES_HOUSE_API_KEY", "")
TOP_N = 50
DELAY = 0.5  # seconds between API calls
SIMILARITY_THRESHOLD = 0.8


# ---------------------------------------------------------------------------
# String similarity (Jaccard on character bigrams — no extra dependencies)
# ---------------------------------------------------------------------------

def _bigrams(s: str) -> set:
    s = s.lower()
    return {s[i : i + 2] for i in range(len(s) - 1)}


def string_similarity(a: str, b: str) -> float:
    """Return a Jaccard-based bigram similarity between 0 and 1."""
    if not a or not b:
        return 0.0
    bg_a = _bigrams(a)
    bg_b = _bigrams(b)
    if not bg_a and not bg_b:
        return 1.0
    intersection = len(bg_a & bg_b)
    union = len(bg_a | bg_b)
    return intersection / union if union else 0.0


def normalise(name: str) -> str:
    """Strip common legal suffixes and punctuation for cleaner comparison."""
    name = name.upper()
    for suffix in [
        "LIMITED", "LTD", "LTD.", "PLC", "CIC", "CIO",
        "LLP", "CORPORATION", "CORP", "INC", "INCORPORATED",
        "COMMUNITY INTEREST COMPANY", "UNIVERSITY OF", "THE",
    ]:
        name = re.sub(r"\b" + re.escape(suffix) + r"\b", "", name)
    return re.sub(r"[^A-Z0-9 ]+", " ", name).strip()


# ---------------------------------------------------------------------------
# Companies House lookup
# ---------------------------------------------------------------------------

def search_companies_house(org_name: str) -> dict | None:
    """
    Call Companies House search API.
    Requires COMPANIES_HOUSE_API_KEY env var (free registration at
    https://developer.company-information.service.gov.uk/).
    Uses HTTP Basic Auth: key as username, empty password.
    Returns the top result dict or None if no results.
    """
    try:
        auth = (CH_API_KEY, "") if CH_API_KEY else None
        resp = requests.get(
            CH_BASE,
            params={"q": org_name, "items_per_page": 1},
            auth=auth,
            timeout=10,
        )
        if resp.status_code == 401:
            print(
                "  [WARN] 401 Unauthorised — set COMPANIES_HOUSE_API_KEY "
                "env var (free at developer.company-information.service.gov.uk)"
            )
            return None
        if resp.status_code != 200:
            print(f"  [WARN] CH API returned {resp.status_code}")
            return None
        data = resp.json()
        items = data.get("items", [])
        return items[0] if items else None
    except Exception as exc:
        print(f"  [WARN] CH API error for '{org_name}': {exc}")
        return None


# ---------------------------------------------------------------------------
# Main enrichment loop
# ---------------------------------------------------------------------------

def main():
    if not CH_API_KEY:
        print(
            "WARNING: COMPANIES_HOUSE_API_KEY is not set.\n"
            "  Register for a free key at: "
            "https://developer.company-information.service.gov.uk/\n"
            "  Add it to .env as: COMPANIES_HOUSE_API_KEY=your_key_here\n"
        )
        # Still create the table so the tool can LEFT JOIN safely
        conn = psycopg2.connect(POSTGRES_URL)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS atlas.organisations (
                id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name                 TEXT UNIQUE,
                companies_house_number TEXT,
                companies_house_status TEXT,
                sic_codes            TEXT[],
                locality             TEXT,
                enriched_at          TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        conn.commit()
        cur.close()
        conn.close()
        print("atlas.organisations table created. Set COMPANIES_HOUSE_API_KEY and re-run to enrich.")
        return

    conn = psycopg2.connect(POSTGRES_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Create atlas.organisations if it doesn't exist
    cur.execute("""
        CREATE TABLE IF NOT EXISTS atlas.organisations (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                 TEXT UNIQUE,
            companies_house_number TEXT,
            companies_house_status TEXT,
            sic_codes            TEXT[],
            locality             TEXT,
            enriched_at          TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    conn.commit()
    print("atlas.organisations table ready.")

    # Fetch top 50 organisations by project count
    cur.execute("""
        SELECT lead_org_name, COUNT(*) AS cnt
        FROM atlas.projects
        WHERE lead_org_name IS NOT NULL
        GROUP BY lead_org_name
        ORDER BY cnt DESC
        LIMIT %s;
    """, (TOP_N,))
    orgs = cur.fetchall()
    print(f"Processing {len(orgs)} organisations...\n")

    found = 0
    matched_above_threshold = 0
    failed = 0

    for i, (org_name, project_count) in enumerate(orgs, 1):
        print(f"[{i:02d}/{len(orgs)}] {org_name!r} ({project_count} projects)")
        result = search_companies_house(org_name)

        if result is None:
            print("  -> No results from Companies House")
            failed += 1
            time.sleep(DELAY)
            continue

        found += 1
        ch_name = result.get("title", "")
        sim = string_similarity(normalise(org_name), normalise(ch_name))
        print(f"  -> Top match: {ch_name!r}  similarity={sim:.2f}")

        if sim < SIMILARITY_THRESHOLD:
            print(f"  -> Similarity {sim:.2f} < threshold {SIMILARITY_THRESHOLD}. Skipping.")
            failed += 1
            time.sleep(DELAY)
            continue

        matched_above_threshold += 1
        company_number = result.get("company_number")
        company_status = result.get("company_status")
        sic_codes = result.get("sic_codes", []) or []
        address = result.get("registered_office_address", {}) or {}
        locality = address.get("locality") or address.get("region")

        cur.execute("""
            INSERT INTO atlas.organisations
                (name, companies_house_number, companies_house_status, sic_codes, locality, enriched_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (name) DO UPDATE SET
                companies_house_number = EXCLUDED.companies_house_number,
                companies_house_status = EXCLUDED.companies_house_status,
                sic_codes              = EXCLUDED.sic_codes,
                locality               = EXCLUDED.locality,
                enriched_at            = NOW();
        """, (org_name, company_number, company_status, sic_codes, locality))
        conn.commit()
        print(f"  -> Upserted. number={company_number}, status={company_status}, locality={locality}")

        time.sleep(DELAY)

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print(f"Results for top {TOP_N} organisations:")
    print(f"  Found in Companies House API : {found}")
    print(f"  Similarity >= {SIMILARITY_THRESHOLD} (written)     : {matched_above_threshold}")
    print(f"  No match / low similarity    : {failed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
