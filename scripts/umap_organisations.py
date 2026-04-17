"""
Project organisation embeddings into UMAP space using the saved training model.

Loads scripts/umap_model.pkl and applies reducer.transform() only — never
fit_transform() — so coordinates stay aligned with atlas.projects.

Env:
  DATABASE_URL (or POSTGRES_URL)
"""

from __future__ import annotations

import os
import pickle
import sys
from pathlib import Path

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
UMAP_MODEL_PATH = SCRIPT_DIR / "umap_model.pkl"

load_dotenv()

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
if not DB_URL:
    print("ERROR: DATABASE_URL or POSTGRES_URL required.", file=sys.stderr)
    sys.exit(1)


def scale_axis(val: float, mn: float, mx: float) -> float:
    if mx == mn:
        return 50.0
    v = (val - mn) / (mx - mn) * 100.0
    return float(max(0.0, min(100.0, v)))


def parse_embedding(raw: object) -> list[float]:
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        return [float(x) for x in raw]
    if isinstance(raw, np.ndarray):
        return [float(x) for x in raw.flatten().tolist()]
    s = str(raw).strip()
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1]
    parts = [p.strip() for p in s.split(",") if p.strip()]
    return [float(x) for x in parts]


def main() -> None:
    if not UMAP_MODEL_PATH.is_file():
        print(
            f"ERROR: {UMAP_MODEL_PATH} missing. Stop — do not fit a new UMAP model.",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(UMAP_MODEL_PATH, "rb") as f:
        bundle = pickle.load(f)

    reducer = bundle["reducer"] if isinstance(bundle, dict) else bundle
    raw_bounds = bundle.get("raw_bounds") if isinstance(bundle, dict) else None
    if raw_bounds is None:
        print("ERROR: umap_model.pkl has no raw_bounds.", file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(DB_URL, sslmode="require")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, embedding
            FROM atlas.organisations
            WHERE embedding IS NOT NULL
            ORDER BY name
            """
        )
        rows = cur.fetchall()

    if not rows:
        print("No organisations with embeddings.")
        conn.close()
        return

    ids = [str(r["id"]) for r in rows]
    mat = np.array([parse_embedding(r["embedding"]) for r in rows], dtype=np.float64)
    print(f"transform() on {mat.shape[0]} org vectors...", flush=True)
    coords = reducer.transform(mat)

    updates: list[tuple[float, float, str]] = []
    for i, oid in enumerate(ids):
        vx = scale_axis(float(coords[i, 0]), raw_bounds["x_min"], raw_bounds["x_max"])
        vy = scale_axis(float(coords[i, 1]), raw_bounds["y_min"], raw_bounds["y_max"])
        updates.append((vx, vy, oid))

    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            "UPDATE atlas.organisations SET viz_x = %s, viz_y = %s WHERE id = %s",
            updates,
            page_size=100,
        )
    conn.commit()

    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FILTER (WHERE viz_x IS NOT NULL) FROM atlas.organisations"
        )
        n = cur.fetchone()[0]
    conn.close()
    print(f"Updated viz_x/viz_y for {len(updates)} organisations (with viz: {n}).", flush=True)


if __name__ == "__main__":
    main()
