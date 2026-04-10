"""
Migrate atlas.passports: add project_name, user_id, trial_date_start/end, tags.
Create atlas.pending_claim_batches for the passport-selection flow.
Run once: python scripts/migrate-passport-v2.py
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur = conn.cursor()

cur.execute("""
ALTER TABLE atlas.passports
  ADD COLUMN IF NOT EXISTS project_name      TEXT,
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS trial_date_start  DATE,
  ADD COLUMN IF NOT EXISTS trial_date_end    DATE,
  ADD COLUMN IF NOT EXISTS tags              TEXT[] NOT NULL DEFAULT '{}';
""")
print("  OK atlas.passports columns added")

cur.execute("""
CREATE TABLE IF NOT EXISTS atlas.pending_claim_batches (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claims     JSONB NOT NULL,
    source_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
""")
print("  OK atlas.pending_claim_batches created")

conn.commit()

# Verify
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'atlas' AND table_name = 'passports'
    ORDER BY ordinal_position
""")
cols = [r[0] for r in cur.fetchall()]
print("\natlas.passports columns:", cols)

conn.close()
print("\nMigration complete.")
