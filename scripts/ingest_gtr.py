"""
GtR Atlas Ingestion — Pass 1
Fetches projects from GtR API across transport + innovation search terms.
Deduplicates by gtr_id. No embeddings yet — that is a separate pass.

Uses psycopg2 for direct Postgres connection (bypasses PostgREST entirely —
same path as all apply_migration runs). Works with any schema, faster bulk
inserts, no exposed-schemas config needed.

Env vars required (from .env):
  DATABASE_URL  — full Postgres connection URI
                  Get from: Supabase Dashboard → Settings → Database
                  → Connection string → Transaction mode (port 6543)
                  Format: postgresql://postgres.[ref]:[password]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
"""

import argparse
import os
import json
import time
import requests
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]

# Repo-root logs/ — updates every page so you can tail for stall detection (dedupe replays included).
REPO_ROOT = Path(__file__).resolve().parent.parent
PROGRESS_FILE = REPO_ROOT / "logs" / "ingest_progress.txt"

GtR_BASE = "https://gtr.ukri.org/gtr/api"
HEADERS = {"Accept": "application/vnd.rcuk.gtr.json-v7"}
PAGE_SIZE = 100
SLEEP_BETWEEN_PAGES = 1.25  # seconds between pages (GtR will 429 if too aggressive)
GT_R_429_MAX_RETRIES = 12
BATCH_SIZE = 100

SEARCH_PASSES = [
    # Transport-primary (high signal)
    {"q": "transport"},
    {"q": "rail"},
    {"q": "railway"},
    {"q": "aviation"},
    {"q": "maritime"},
    {"q": "highway"},
    {"q": "autonomous vehicle"},
    {"q": "connected vehicle"},
    {"q": "driverless"},
    {"q": "electric vehicle"},
    {"q": "drone"},
    {"q": "UAV"},
    {"q": "eVTOL"},
    {"q": "freight"},
    {"q": "logistics"},
    {"q": "port"},
    {"q": "airport"},
    {"q": "station"},
    {"q": "depot"},
    {"q": "mobility"},
    {"q": "MaaS"},
    {"q": "micromobility"},
    {"q": "last mile"},
    {"q": "passenger transport"},
    {"q": "decarbonisation transport"},
    {"q": "electrification transport"},
    {"q": "hydrogen transport"},
    {"q": "zero emission vehicle"},
    {"q": "clean energy transport"},
    {"q": "SAF"},  # Sustainable Aviation Fuel
    {"q": "traffic"},
    {"q": "signalling"},
    {"q": "fleet management"},
    {"q": "multimodal"},
    # CCAV — dedicated CAV funder, fetch all
    {"f_fc": "CCAV"},
]

INSERT_SQL = """
INSERT INTO atlas.projects (
    gtr_id, grant_reference, title, abstract, tech_abstract,
    potential_impact, status, grant_category, lead_funder,
    lead_org_department, start_date, end_date, funding_amount,
    research_subjects, research_topics, cpc_modes, cpc_themes,
    transport_relevance_score, embedding, raw_json
) VALUES (
    %(gtr_id)s, %(grant_reference)s, %(title)s, %(abstract)s,
    %(tech_abstract)s, %(potential_impact)s, %(status)s,
    %(grant_category)s, %(lead_funder)s, %(lead_org_department)s,
    %(start_date)s, %(end_date)s, %(funding_amount)s,
    %(research_subjects)s, %(research_topics)s,
    %(cpc_modes)s, %(cpc_themes)s,
    %(transport_relevance_score)s, %(embedding)s,
    %(raw_json)s
)
ON CONFLICT (gtr_id) DO NOTHING
"""


def write_ingest_progress(
    cur,
    pass_num: int,
    total_passes: int,
    label: str,
    page: int,
    total_pages: int,
) -> None:
    """Single-line heartbeat file for external monitoring (Cursor closed, CI, etc.)."""
    cur.execute("SELECT count(*) FROM atlas.projects")
    db_count = cur.fetchone()[0]
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = (
        f"{datetime.now(timezone.utc).isoformat()} | "
        f"Pass {pass_num}/{total_passes} | {label} | "
        f"Page {page}/{total_pages} | DB total: {db_count}\n"
    )
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        f.write(line)


def fetch_projects_page(params: dict, page: int) -> dict:
    """GET one page; retry on HTTP 429 with backoff (Retry-After or exponential)."""
    p = {**params, "fetchSize": PAGE_SIZE, "page": page}
    url = f"{GtR_BASE}/projects"
    for attempt in range(GT_R_429_MAX_RETRIES):
        r = requests.get(url, headers=HEADERS, params=p, timeout=60)
        if r.status_code == 429:
            ra = r.headers.get("Retry-After", "").strip()
            if ra.isdigit():
                wait = int(ra)
            else:
                wait = min(300, 20 * (2**attempt))
            print(
                f"  GtR 429 rate limit - sleeping {wait}s "
                f"(retry {attempt + 1}/{GT_R_429_MAX_RETRIES})",
                flush=True,
            )
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(
        f"GtR API still returning 429 after {GT_R_429_MAX_RETRIES} retries"
    )


def parse_date(val) -> str | None:
    if val is None:
        return None
    if isinstance(val, int):
        return datetime.fromtimestamp(val / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    return str(val)[:10]


def parse_project(p: dict) -> dict:
    """Extract flat fields from a GtR project JSON object."""
    links = p.get("links", {}).get("link", []) or []
    if isinstance(links, dict):
        links = [links]

    fund_link = next((l for l in links if l.get("rel") == "FUND"), None)
    start = parse_date(fund_link.get("start")) if fund_link else None
    end = parse_date(fund_link.get("end")) if fund_link else None

    pv = p.get("participantValues") or {}
    participants = pv.get("participant", []) or []
    if isinstance(participants, dict):
        participants = [participants]
    funding = sum(float(pt.get("grantOffer", 0) or 0) for pt in participants)
    if funding == 0 and fund_link:
        funding = None

    rs = (p.get("researchSubjects") or {}).get("researchSubject", []) or []
    subjects = [
        s.get("text") for s in rs
        if s.get("text") and s.get("text") != "Unclassified"
    ]
    rt = (p.get("researchTopics") or {}).get("researchTopic", []) or []
    topics = [
        t.get("text") for t in rt
        if t.get("text") and t.get("text") != "Unclassified"
    ]

    identifiers = (p.get("identifiers") or {}).get("identifier", []) or []
    if isinstance(identifiers, dict):
        identifiers = [identifiers]
    grant_ref = next(
        (i.get("value") for i in identifiers if i.get("type") == "RCUK"), None
    )

    return {
        "gtr_id": p.get("id"),
        "grant_reference": grant_ref,
        "title": p.get("title", ""),
        "abstract": p.get("abstractText"),
        "tech_abstract": p.get("techAbstractText"),
        "potential_impact": p.get("potentialImpact"),
        "status": p.get("status"),
        "grant_category": p.get("grantCategory"),
        "lead_funder": p.get("leadFunder"),
        "lead_org_department": p.get("leadOrganisationDepartment"),
        "start_date": start,
        "end_date": end,
        "funding_amount": funding if funding else None,
        "research_subjects": subjects or None,
        "research_topics": topics or None,
        "cpc_modes": None,
        "cpc_themes": None,
        "transport_relevance_score": 0,
        "embedding": None,
        "raw_json": json.dumps(p),
    }


def ingest_pass(
    conn,
    params: dict,
    pass_num: int,
    total_passes: int,
    label: str,
) -> tuple[int, int]:
    """Run a single search pass. Returns (fetched, inserted)."""
    fetched = 0
    inserted = 0
    page = 1

    with conn.cursor() as cur:
        while True:
            try:
                data = fetch_projects_page(params, page)
            except Exception as e:
                print(f"  API error on page {page}: {e}")
                break

            projects = data.get("project", [])
            if isinstance(projects, dict):
                projects = [projects]

            total_pages = data.get("totalPages", 1)
            fetched += len(projects)

            rows = [parse_project(p) for p in projects if p.get("id")]

            if rows:
                try:
                    psycopg2.extras.execute_batch(cur, INSERT_SQL, rows, page_size=BATCH_SIZE)
                    conn.commit()
                    inserted += len(rows)
                except Exception as e:
                    conn.rollback()
                    print(f"  Insert error on page {page}: {e}")

            print(
                f"  Page {page}/{total_pages} - {len(projects)} fetched,"
                f" running total: {fetched}",
                flush=True,
            )

            write_ingest_progress(
                cur, pass_num, total_passes, label, page, total_pages
            )

            if page >= total_pages:
                break
            page += 1
            time.sleep(SLEEP_BETWEEN_PAGES)

    return fetched, inserted


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="GtR Atlas ingestion into atlas.projects (dedupe by gtr_id)."
    )
    p.add_argument(
        "--start-pass",
        type=int,
        default=1,
        metavar="N",
        help=(
            "1-based index of the first search pass to run (skip earlier passes). "
            f"Use 2 to skip pass 1 (transport). Valid range: 1..{len(SEARCH_PASSES)}."
        ),
    )
    args = p.parse_args()
    if args.start_pass < 1 or args.start_pass > len(SEARCH_PASSES):
        raise SystemExit(
            f"--start-pass must be between 1 and {len(SEARCH_PASSES)}; got {args.start_pass}"
        )
    return args


def main():
    args = parse_args()
    start_idx = args.start_pass - 1
    passes_to_run = SEARCH_PASSES[start_idx:]
    total_passes = len(SEARCH_PASSES)

    print("Connecting to Supabase Postgres...", flush=True)
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    print("Connected.", flush=True)

    if start_idx > 0:
        print(
            f"Skipping passes 1..{start_idx} (--start-pass {args.start_pass})",
            flush=True,
        )

    total_fetched = 0
    total_inserted = 0
    start_time = time.time()

    for i, params in enumerate(passes_to_run):
        pass_num = start_idx + i + 1
        label = params.get("q") or params.get("f_fc") or str(params)
        print(f"\n[{pass_num}/{total_passes}] Search: '{label}'", flush=True)

        fetched, inserted = ingest_pass(
            conn, params, pass_num, total_passes, label
        )
        total_fetched += fetched
        total_inserted += inserted

        print(f"  -> {fetched} fetched, {inserted} inserted", flush=True)

    conn.close()

    elapsed = time.time() - start_time
    elapsed_min = int(elapsed // 60)
    elapsed_sec = int(elapsed % 60)

    print(f"\n{'=' * 50}")
    print(f"COMPLETE")
    print(f"Total fetched:  {total_fetched}")
    print(f"Total inserted: {total_inserted} (deduped)")
    print(f"Runtime:        {elapsed_min}m {elapsed_sec}s")
    print(f"{'=' * 50}")
    print(f"\nNext steps:")
    print(f"  1. Run embed_atlas.py to generate project embeddings")
    print(f"  2. Run embed_lens_categories.py to enable semantic lens matching")


if __name__ == "__main__":
    main()
