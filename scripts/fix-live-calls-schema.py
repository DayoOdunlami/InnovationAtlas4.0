"""One-time: fix atlas.live_calls.funding_amount from NUMERIC to TEXT."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur = conn.cursor()
cur.execute(
    "ALTER TABLE atlas.live_calls "
    "ALTER COLUMN funding_amount TYPE TEXT USING funding_amount::text"
)
conn.commit()
print("Done: funding_amount is now TEXT")
conn.close()
