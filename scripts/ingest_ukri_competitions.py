"""
Scrape open competitions from the Innovate UK / Innovation Funding Service
and ingest matching ones into atlas.live_calls.

Source: https://apply-for-innovation-funding.service.gov.uk/competition/search

Keyword filter (title OR description must contain at least one term):
  transport, autonomous, connected, decarbonisation, built environment,
  infrastructure, mobility, clean maritime, zero emission, rail, aviation,
  highway

Storage:
  - source        = 'innovate_uk'
  - funder        = 'Innovate UK'
  - status        = 'open'
  - source_url    = unique key  (ON CONFLICT DO NOTHING)

Env:
  DATABASE_URL  — Supabase transaction pooler URI (port 6543, sslmode=require)
"""

from __future__ import annotations

import os
import re
from datetime import date, datetime
from typing import Optional

import psycopg2
import psycopg2.extras
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]

BASE_URL = "https://apply-for-innovation-funding.service.gov.uk"
SEARCH_URL = f"{BASE_URL}/competition/search"
HEADERS = {"User-Agent": "Mozilla/5.0 (InnovationAtlas/4.0; contact@cpc.org.uk)"}

KEYWORDS = [
    "transport",
    "autonomous",
    "connected",
    "decarbonisation",
    "decarbonization",
    "built environment",
    "infrastructure",
    "mobility",
    "clean maritime",
    "zero emission",
    "rail",
    "aviation",
    "highway",
]

INSERT_SQL = """
INSERT INTO atlas.live_calls (
    title, funder, deadline, funding_amount, description,
    source_url, status, source, scraped_at
) VALUES (
    %s, %s, %s, %s, %s, %s, %s, %s, NOW()
)
ON CONFLICT (source_url) DO NOTHING
"""


def matches_keywords(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in KEYWORDS)


def parse_funding_amount(text: str) -> Optional[str]:
    """Extract funding amount mention from description text."""
    # Match patterns like "£4.5 million", "up to £20 million", "$2M", etc.
    m = re.search(
        r"((?:up to |a share of (?:up to )?)?[£$€]\s*[\d,\.]+\s*(?:million|billion|m\b|bn\b)?)",
        text,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).strip()[:500]
    return None


def parse_date(text: str) -> Optional[date]:
    """Parse date strings like '21 April 2026', '27 May 2026'."""
    text = text.strip()
    for fmt in ("%d %B %Y", "%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def parse_competitions_from_soup(soup: BeautifulSoup) -> list[dict]:
    """Extract competition entries from a parsed search results page."""
    competitions: list[dict] = []
    overview_links = soup.find_all("a", href=lambda x: x and "/overview/" in str(x))

    for link in overview_links:
        href = link.get("href", "")
        title = link.get_text(strip=True)
        if not title or not href:
            continue

        source_url = BASE_URL + href if href.startswith("/") else href

        li = link.find_parent("li")
        if not li:
            continue

        full_text = li.get_text(separator=" ", strip=True)

        desc_div = li.find("div", class_="wysiwyg-styles")
        description = desc_div.get_text(strip=True) if desc_div else ""

        funding = parse_funding_amount(description)

        dl = li.find("dl")
        closes_date: Optional[date] = None
        if dl:
            dts = dl.find_all("dt")
            dds = dl.find_all("dd")
            for dt, dd in zip(dts, dds):
                if "closes" in dt.get_text(strip=True).lower():
                    closes_date = parse_date(dd.get_text(strip=True))

        competitions.append(
            {
                "title": title[:2000],
                "description": description[:8000] if description else full_text[:8000],
                "funding_amount": funding,
                "deadline": closes_date,
                "source_url": source_url[:4000],
                "match_text": f"{title} {description}",
            }
        )
    return competitions


def scrape_competitions() -> list[dict]:
    """Fetch all pages of the search results and return all competition entries."""
    all_competitions: list[dict] = []
    seen_urls: set[str] = set()
    page = 1

    while True:
        print(f"Fetching {SEARCH_URL} page {page}...", flush=True)
        resp = requests.get(SEARCH_URL, headers=HEADERS, params={"page": str(page)}, timeout=30)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        if page == 1:
            count_text = soup.find(
                string=lambda t: t and "competition" in t.lower() and any(c.isdigit() for c in str(t))
            )
            print(f"  Page reports: {count_text.strip() if count_text else 'unknown'}", flush=True)

        page_comps = parse_competitions_from_soup(soup)
        new_comps = [c for c in page_comps if c["source_url"] not in seen_urls]

        if not new_comps:
            print(f"  No new competitions on page {page} — stopping.", flush=True)
            break

        for c in new_comps:
            seen_urls.add(c["source_url"])
        all_competitions.extend(new_comps)
        print(f"  Found {len(new_comps)} competitions on page {page} (running total: {len(all_competitions)})", flush=True)

        # If fewer than expected per page, we're on the last page
        if len(page_comps) < 10:
            break

        page += 1

    print(f"Parsed {len(all_competitions)} total competitions across all pages.", flush=True)
    return all_competitions


def main() -> None:
    competitions = scrape_competitions()

    # Filter by keywords
    matched = [c for c in competitions if matches_keywords(c["match_text"])]
    print(f"Competitions matching keywords: {len(matched)}", flush=True)

    if not matched:
        print("No matching competitions found. Nothing to ingest.")
        return

    for c in matched:
        print(f"  MATCH: {c['title'][:80]}")

    print(f"\nConnecting to DB...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")

    rows = [
        (
            c["title"],
            "Innovate UK",
            c["deadline"],
            c["funding_amount"],
            c["description"],
            c["source_url"],
            "open",
            "innovate_uk",
        )
        for c in matched
    ]

    with conn.cursor() as cur:
        before_cur = conn.cursor()
        before_cur.execute("SELECT COUNT(*) FROM atlas.live_calls WHERE source = 'innovate_uk'")
        before_count = before_cur.fetchone()[0]
        before_cur.close()

        psycopg2.extras.execute_batch(cur, INSERT_SQL, rows, page_size=50)
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM atlas.live_calls WHERE source = 'innovate_uk'")
        after_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM atlas.live_calls")
        total_count = cur.fetchone()[0]

    conn.close()

    inserted = after_count - before_count
    print(f"\n{'=' * 50}", flush=True)
    print(f"COMPLETE", flush=True)
    print(f"Competitions found (matching keywords): {len(matched)}", flush=True)
    print(f"Competitions ingested (new):            {inserted}", flush=True)
    print(f"Total rows in atlas.live_calls:         {total_count}", flush=True)
    print(f"{'=' * 50}", flush=True)


if __name__ == "__main__":
    main()
