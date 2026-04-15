"""
Embed atlas.live_calls rows that are missing embeddings.

Skips rows where embedding IS NOT NULL.
Skips find_a_tender rows tagged irrelevant (audit-only).

For each batch: OpenAI text-embedding-3-small, then UMAP viz_x/viz_y when
scripts/umap_model.pkl is present and coords missing.

Batches calls in groups of 50. Sleeps 0.1s between batch API calls.

Env:
  DATABASE_URL
  OPENAI_API_KEY
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
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
MODEL = "text-embedding-3-small"
BATCH_SIZE = 50
UMAP_MODEL_PATH = SCRIPT_DIR / "umap_model.pkl"


def scale_axis(val: float, mn: float, mx: float) -> float:
    if mx == mn:
        return 50.0
    v = (val - mn) / (mx - mn) * 100.0
    return float(max(0.0, min(100.0, v)))


def main() -> None:
    print("Connecting to DB...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    ensure_live_calls_columns(conn)

    reducer = None
    raw_bounds: dict | None = None
    if UMAP_MODEL_PATH.is_file():
        with open(UMAP_MODEL_PATH, "rb") as f:
            bundle = pickle.load(f)
        reducer = bundle["reducer"] if isinstance(bundle, dict) else bundle
        raw_bounds = bundle.get("raw_bounds") if isinstance(bundle, dict) else None

    client = OpenAI(api_key=OPENAI_API_KEY)

    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(
            """
            SELECT id, title, description
            FROM atlas.live_calls
            WHERE embedding IS NULL
              AND NOT (
                source = 'find_a_tender' AND relevance_tag = 'irrelevant'
              )
            ORDER BY scraped_at NULLS LAST, id
            """
        )
        rows = cur.fetchall()

    total = len(rows)
    print(f"Found {total} live calls without embeddings.", flush=True)

    if total == 0:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*), COUNT(embedding) FROM atlas.live_calls")
            grand_total, has_embedding = cur.fetchone()
        conn.close()
        print(f"All {grand_total} live calls already have embeddings. Done.")
        return

    embedded = 0
    for batch_start in range(0, total, BATCH_SIZE):
        batch = rows[batch_start : batch_start + BATCH_SIZE]
        texts = []
        for r in batch:
            t = ((r["title"] or "") + " " + (r["description"] or "")).strip()
            texts.append(t or (r["title"] or "live call"))

        ids = [str(r["id"]) for r in batch]

        print(
            f"  Embedding batch {batch_start + 1}-{batch_start + len(batch)} of {total}...",
            flush=True,
        )

        emb_resp = client.embeddings.create(input=texts, model=MODEL)
        vectors = [emb_resp.data[i].embedding for i in range(len(emb_resp.data))]

        coords = None
        if reducer is not None and raw_bounds:
            arr = np.array(vectors, dtype=np.float64)
            coords = reducer.transform(arr)

        with conn.cursor() as cur:
            for i, row_id in enumerate(ids):
                vec_str = str(vectors[i])
                if coords is not None:
                    vx = scale_axis(
                        float(coords[i, 0]),
                        raw_bounds["x_min"],
                        raw_bounds["x_max"],
                    )
                    vy = scale_axis(
                        float(coords[i, 1]),
                        raw_bounds["y_min"],
                        raw_bounds["y_max"],
                    )
                    cur.execute(
                        """
                        UPDATE atlas.live_calls
                        SET embedding = %s::vector,
                            viz_x = COALESCE(viz_x, %s),
                            viz_y = COALESCE(viz_y, %s)
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
        embedded += len(batch)

        time.sleep(0.1)

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), COUNT(embedding) FROM atlas.live_calls")
        grand_total, has_embedding = cur.fetchone()

    conn.close()

    print(f"\n{'=' * 50}", flush=True)
    print("COMPLETE", flush=True)
    print(f"Embedded this run  : {embedded}", flush=True)
    print(f"With embedding     : {has_embedding} / {grand_total}", flush=True)
    print(f"Still missing      : {grand_total - has_embedding}", flush=True)
    print(f"{'=' * 50}", flush=True)


if __name__ == "__main__":
    main()
