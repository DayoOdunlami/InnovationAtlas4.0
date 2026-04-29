import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur = conn.cursor()
cur.execute(
    "SELECT column_name, data_type FROM information_schema.columns "
    "WHERE table_schema='atlas' AND table_name='live_calls' ORDER BY ordinal_position"
)
rows = cur.fetchall()
print("live_calls columns:")
for r in rows:
    print(" ", r)
cur.execute("SELECT COUNT(*) FROM atlas.live_calls")
print("live_calls row count:", cur.fetchone()[0])
conn.close()
