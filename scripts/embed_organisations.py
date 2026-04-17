"""
Embed atlas.organisations rows where embedding IS NULL.

Model: text-embedding-3-small (same as atlas.projects). Batches of 100.

Run after extract_organisations.py.

Env:
  DATABASE_URL (or POSTGRES_URL)
  OPENAI_API_KEY
"""

from __future__ import annotations

import os
import sys
import time

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not DB_URL or not OPENAI_API_KEY:
    print("ERROR: DATABASE_URL/POSTGRES_URL and OPENAI_API_KEY required.", file=sys.stderr)
    sys.exit(1)

MODEL = "text-embedding-3-small"
BATCH_SIZE = 100


def build_embed_text(
    name: str,
    org_type: str | None,
    topics: list[str] | None,
    y0: int | None,
    y1: int | None,
) -> str:
    tlist = (topics or [])[:10]
    topics_str = ", ".join(tlist) if tlist else "general innovation"
    ot = org_type or "unknown"
    span = (
        f"{y0}–{y1}"
        if y0 is not None and y1 is not None
        else (str(y0 or "?") + "–" + str(y1 or "?"))
    )
    return f"{name}. {ot} organisation. Research areas: {topics_str}. Active {span}."


def main() -> None:
    conn = psycopg2.connect(DB_URL, sslmode="require")
    client = OpenAI(api_key=OPENAI_API_KEY)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, name, org_type, research_topics, first_project_year, last_project_year
            FROM atlas.organisations
            WHERE embedding IS NULL
            ORDER BY name
            """
        )
        rows = cur.fetchall()

    total = len(rows)
    print(f"Organisations to embed: {total}", flush=True)
    if total == 0:
        conn.close()
        print("Nothing to do.")
        return

    done = 0
    for start in range(0, total, BATCH_SIZE):
        batch = rows[start : start + BATCH_SIZE]
        texts = [
            build_embed_text(
                r["name"],
                r["org_type"],
                r["research_topics"],
                r["first_project_year"],
                r["last_project_year"],
            )
            for r in batch
        ]
        resp = client.embeddings.create(input=texts, model=MODEL)
        updates: list[tuple[str, str]] = []
        for i, r in enumerate(batch):
            vec = resp.data[i].embedding
            updates.append((str(vec), str(r["id"])))

        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(
                cur,
                "UPDATE atlas.organisations SET embedding = %s::vector WHERE id = %s",
                updates,
                page_size=50,
            )
        conn.commit()
        done += len(batch)
        print(f"  Embedded {done}/{total}", flush=True)
        if start + BATCH_SIZE < total:
            time.sleep(0.2)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*), COUNT(*) FILTER (WHERE embedding IS NOT NULL) "
            "FROM atlas.organisations"
        )
        tot, emb = cur.fetchone()
    conn.close()
    print(f"Done. organisations total={tot}, with embedding={emb}", flush=True)


if __name__ == "__main__":
    main()
