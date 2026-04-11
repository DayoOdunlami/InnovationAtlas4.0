import os, psycopg2, json
from dotenv import load_dotenv
load_dotenv()
conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur = conn.cursor()

cur.execute("""
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='atlas' AND table_name='passport_gaps'
ORDER BY ordinal_position
""")
rows = cur.fetchall()
print("atlas.passport_gaps schema:")
for r in rows:
    print(f"  {r[0]:35s} {r[1]:25s} nullable={r[2]}")

cur.execute("""
SELECT COUNT(*) FROM atlas.passport_gaps
""")
print(f"\nExisting rows in atlas.passport_gaps: {cur.fetchone()[0]}")

cur.execute("""
SELECT id, passport_id, match_type, gaps
FROM atlas.matches
WHERE gaps IS NOT NULL AND gaps != '[]'::jsonb
LIMIT 3
""")
rows = cur.fetchall()
print(f"\nMatches with non-empty gaps: {len(rows)}")
for r in rows:
    print(f"\n  match_id={str(r[0])[:8]} passport={str(r[1])[:8]} type={r[2]}")
    gaps = r[3] if isinstance(r[3], list) else json.loads(r[3])
    for g in gaps[:2]:
        print(f"  gap: {json.dumps(g, indent=4)[:300]}")

cur.execute("""
SELECT COUNT(*) FROM atlas.matches WHERE gaps IS NOT NULL AND gaps != '[]'::jsonb
""")
print(f"\nTotal matches with gaps: {cur.fetchone()[0]}")

cur.execute("""
SELECT COUNT(*) FROM atlas.matches WHERE passport_id = 'e56f7263-f667-45de-8ff3-5b63dafbf5e8'
""")
print(f"Matches for test passport: {cur.fetchone()[0]}")

conn.close()
