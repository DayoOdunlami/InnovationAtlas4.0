"""Inspect schemas needed for matching engine."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur = conn.cursor()

for tbl in ["projects", "project_outcomes", "matches", "live_calls", "passport_claims"]:
    cur.execute(
        "SELECT column_name, data_type, is_nullable "
        "FROM information_schema.columns "
        f"WHERE table_schema='atlas' AND table_name='{tbl}' ORDER BY ordinal_position"
    )
    rows = cur.fetchall()
    print(f"\n--- atlas.{tbl} ---")
    for r in rows:
        print(f"  {r[0]:30s} {r[1]:30s} nullable={r[2]}")

# Sample project row to see actual data shape
cur.execute("""
    SELECT id, title, lead_funder, funding_amount,
           octet_length(embedding::text) AS emb_bytes,
           viz_x, viz_y
    FROM atlas.projects
    WHERE embedding IS NOT NULL LIMIT 2
""")
print("\n--- sample atlas.projects rows ---")
for r in cur.fetchall():
    print(" ", r)

# Check project_outcomes
cur.execute("SELECT COUNT(*) FROM atlas.project_outcomes")
print("\natlas.project_outcomes rows:", cur.fetchone()[0])
cur.execute("SELECT * FROM atlas.project_outcomes LIMIT 2")
rows = cur.fetchall()
if rows:
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='atlas' AND table_name='project_outcomes' ORDER BY ordinal_position")
    cols = [r[0] for r in cur.fetchall()]
    print("columns:", cols)
    for r in rows:
        print(" ", r)

conn.close()
