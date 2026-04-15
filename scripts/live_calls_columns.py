"""Ensure atlas.live_calls has columns used by ingestion / matching."""

from __future__ import annotations

import psycopg2

DDL_STATEMENTS = [
    "ALTER TABLE atlas.live_calls ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'horizon_europe'",
    "ALTER TABLE atlas.live_calls ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ",
    "ALTER TABLE atlas.live_calls ADD COLUMN IF NOT EXISTS relevance_tag TEXT",
    "ALTER TABLE atlas.live_calls ADD COLUMN IF NOT EXISTS relevance_reason TEXT",
]


def ensure_live_calls_columns(conn) -> None:
    with conn.cursor() as cur:
        for stmt in DDL_STATEMENTS:
            cur.execute(stmt)
    conn.commit()
