"""Add live_call_id to atlas.matches for live-call matches."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur = conn.cursor()

cur.execute("""
ALTER TABLE atlas.matches
  ADD COLUMN IF NOT EXISTS live_call_id UUID REFERENCES atlas.live_calls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_type   TEXT NOT NULL DEFAULT 'project';
""")
conn.commit()
print("OK: live_call_id + match_type added to atlas.matches")

cur.execute("""
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='atlas' AND table_name='matches'
ORDER BY ordinal_position
""")
for r in cur.fetchall():
    print(f"  {r[0]:30s} {r[1]:25s} nullable={r[2]}")

conn.close()
