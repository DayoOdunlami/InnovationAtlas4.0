"""
Atlas UMAP — one-time 2D layout for Innovation Landscape

Reads embeddings from atlas.projects, runs UMAP (cosine, 2D), normalises
coordinates to 0–100, writes viz_x and viz_y.

Run once from repo root:
  pip install -r scripts/requirements-atlas.txt
  python scripts/umap_atlas.py

Requires DATABASE_URL in .env (Supabase Postgres).
"""

from __future__ import annotations

import os
import pickle
import sys
from pathlib import Path

import numpy as np
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_batch

SCRIPT_DIR = Path(__file__).resolve().parent
UMAP_MODEL_PATH = SCRIPT_DIR / "umap_model.pkl"

load_dotenv()

DB_URL = os.environ["DATABASE_URL"]


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


def normalise(arr: np.ndarray) -> np.ndarray:
    mn = float(arr.min())
    mx = float(arr.max())
    if mx == mn:
        return np.full_like(arr, 50.0, dtype=np.float64)
    return (arr - mn) / (mx - mn) * 100.0


def main() -> None:
    try:
        import umap
    except ImportError:
        print(
            "Missing umap-learn. Install: pip install -r scripts/requirements-atlas.txt",
            file=sys.stderr,
        )
        raise SystemExit(1) from None

    print("Connecting to Supabase...", flush=True)
    conn = psycopg2.connect(DB_URL, sslmode="require")
    cur = conn.cursor()

    print("Fetching embeddings...", flush=True)
    cur.execute(
        """
        SELECT id, embedding
        FROM atlas.projects
        WHERE embedding IS NOT NULL
        ORDER BY id
        """
    )
    rows = cur.fetchall()
    n = len(rows)
    print(f"Found {n} projects with embeddings", flush=True)

    if n == 0:
        print("Nothing to do.", flush=True)
        cur.close()
        conn.close()
        return

    ids = [r[0] for r in rows]
    embeddings_list = [parse_embedding(r[1]) for r in rows]
    dim = len(embeddings_list[0])
    if not all(len(v) == dim for v in embeddings_list):
        cur.close()
        conn.close()
        raise SystemExit("Inconsistent embedding dimensions across rows.")

    embeddings = np.array(embeddings_list, dtype=np.float64)
    print(f"Embedding matrix shape: {embeddings.shape}", flush=True)
    print("Running UMAP (this takes 1-2 minutes)...", flush=True)

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    )
    coords = reducer.fit_transform(embeddings)
    print(
        f"UMAP complete. Coordinate range: x={coords[:, 0].min():.2f} to "
        f"{coords[:, 0].max():.2f}, y={coords[:, 1].min():.2f} to {coords[:, 1].max():.2f}",
        flush=True,
    )

    raw_x_min = float(coords[:, 0].min())
    raw_x_max = float(coords[:, 0].max())
    raw_y_min = float(coords[:, 1].min())
    raw_y_max = float(coords[:, 1].max())

    viz_x = normalise(coords[:, 0])
    viz_y = normalise(coords[:, 1])

    print("Saving UMAP model + raw bounds to umap_model.pkl...", flush=True)
    with open(UMAP_MODEL_PATH, "wb") as f:
        pickle.dump(
            {
                "reducer": reducer,
                "raw_bounds": {
                    "x_min": raw_x_min,
                    "x_max": raw_x_max,
                    "y_min": raw_y_min,
                    "y_max": raw_y_max,
                },
            },
            f,
        )
    print(f"Saved to {UMAP_MODEL_PATH}", flush=True)

    print("Adding viz_x, viz_y columns if needed...", flush=True)
    cur.execute(
        """
        ALTER TABLE atlas.projects
        ADD COLUMN IF NOT EXISTS viz_x NUMERIC,
        ADD COLUMN IF NOT EXISTS viz_y NUMERIC
        """
    )
    conn.commit()

    print("Writing coordinates to database...", flush=True)
    updates = [(float(viz_x[i]), float(viz_y[i]), ids[i]) for i in range(n)]
    execute_batch(
        cur,
        """
        UPDATE atlas.projects
        SET viz_x = %s, viz_y = %s
        WHERE id = %s
        """,
        updates,
    )
    conn.commit()

    print(f"\n{'=' * 50}", flush=True)
    print("COMPLETE", flush=True)
    print(f"Updated {n} projects with UMAP coordinates", flush=True)
    print("Columns viz_x, viz_y now populated in atlas.projects", flush=True)
    print(f"{'=' * 50}", flush=True)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
