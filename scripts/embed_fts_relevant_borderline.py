"""
Embed find_a_tender live_calls that are tagged relevant/borderline but missing embeddings.

Text: title + ' ' + first 1000 chars of description.
Sleep 0.05s between OpenAI calls.

After embedding, backfill viz_x / viz_y via scripts/umap_model.pkl when missing.

Env: DATABASE_URL, OPENAI_API_KEY
"""

from __future__ import annotations

import os
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from live_calls_columns import ensure_live_calls_columns  # noqa: E402

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]
MODEL = "text-embedding-3-small"
UMAP_MODEL_PATH = SCRIPT_DIR / "umap_model.pkl"


def scale_axis(val: float, mn: float, mx: float) -> float:
    if mx == mn:
        return 50.0
    v = (val - mn) / (mx - mn) * 100.0
    return float(max(0.0, min(100.0, v)))


def main() -> None:
    conn = psycopg2.connect(DB_URL, sslmode="require")
    ensure_live_calls_columns(conn)

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(
            """
            SELECT id, title, description
            FROM atlas.live_calls
            WHERE source = 'find_a_tender'
              AND embedding IS NULL
              AND relevance_tag IN ('relevant', 'borderline')
            ORDER BY scraped_at NULLS LAST, id
            """
        )
        rows = cur.fetchall()

    n = len(rows)
    print(f"Found {n} FTS rows to embed (relevant/borderline, null embedding).", flush=True)

    if n == 0:
        conn.close()
        _report_counts()
        return

    reducer = None
    raw_bounds = None
    if UMAP_MODEL_PATH.is_file():
        with open(UMAP_MODEL_PATH, "rb") as f:
            bundle = pickle.load(f)
        reducer = bundle["reducer"] if isinstance(bundle, dict) else bundle
        raw_bounds = bundle.get("raw_bounds") if isinstance(bundle, dict) else None

    done = 0
    for r in rows:
        title = (r["title"] or "").strip()
        desc = (r["description"] or "")[:1000]
        text = f"{title} {desc}".strip()
        if not text:
            text = title or "tender"

        emb = client.embeddings.create(input=[text], model=MODEL)
        vec = emb.data[0].embedding
        vec_str = str(vec)
        row_id = str(r["id"])

        vx, vy = None, None
        if reducer is not None and raw_bounds:
            arr = np.array([vec], dtype=np.float64)
            coords = reducer.transform(arr)
            vx = scale_axis(float(coords[0, 0]), raw_bounds["x_min"], raw_bounds["x_max"])
            vy = scale_axis(float(coords[0, 1]), raw_bounds["y_min"], raw_bounds["y_max"])

        with conn.cursor() as cur:
            if vx is not None and vy is not None:
                cur.execute(
                    """
                    UPDATE atlas.live_calls
                    SET embedding = %s::vector, viz_x = %s, viz_y = %s
                    WHERE id = %s
                    """,
                    (vec_str, vx, vy, row_id),
                )
            else:
                cur.execute(
                    "UPDATE atlas.live_calls SET embedding = %s::vector WHERE id = %s",
                    (vec_str, row_id),
                )
        conn.commit()
        done += 1
        time.sleep(0.05)

    print(f"Embedded {done} row(s).", flush=True)
    conn.close()
    _report_counts()


def _report_counts() -> None:
    c = psycopg2.connect(DB_URL, sslmode="require")
    with c.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL),
                   COUNT(*)
            FROM atlas.live_calls
            WHERE source = 'find_a_tender'
            """
        )
        emb, tot = cur.fetchone()
        print(f"FTS live_calls with embeddings: {emb} / {tot}", flush=True)
    c.close()


if __name__ == "__main__":
    main()
