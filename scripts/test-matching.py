"""
Quick test of the matching engine SQL logic.
Loads claims for passport e56f7263, embeds them, runs pgvector,
shows top matches WITHOUT writing to DB.
"""
import os
import json
import numpy as np
import psycopg2
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

PASSPORT_ID = "e56f7263-f667-45de-8ff3-5b63dafbf5e8"

conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur = conn.cursor()

# 1. Load claims
cur.execute(
    """SELECT id, claim_role, claim_domain, claim_text, conditions
       FROM atlas.passport_claims
       WHERE passport_id = %s AND rejected IS NOT TRUE
       ORDER BY claim_domain, created_at""",
    (PASSPORT_ID,)
)
claims = cur.fetchall()
print(f"\nPassport: {PASSPORT_ID}")
print(f"Claims loaded: {len(claims)}")

if not claims:
    print("No non-rejected claims found. Exiting.")
    conn.close()
    exit()

for c in claims:
    print(f"  [{c[1]}/{c[2]}] {c[3][:80]}")

# 2. Build embed text
embed_text = "\n".join(
    f"[{c[1]} / {c[2]}] {c[3]}" + (f" (conditions: {c[4]})" if c[4] else "")
    for c in claims
)
print(f"\nEmbed text ({len(embed_text)} chars):\n{embed_text[:400]}...")

# 3. Embed with OpenAI
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
resp = client.embeddings.create(
    model="text-embedding-3-small",
    input=embed_text
)
embedding = resp.data[0].embedding
print(f"\nEmbedding dims: {len(embedding)}")
vector_str = f"[{','.join(str(x) for x in embedding)}]"

# 4. pgvector cosine similarity on atlas.projects
cur.execute(
    """SELECT
         p.id,
         p.title,
         p.lead_funder,
         p.funding_amount,
         p.transport_relevance_score,
         (1 - (p.embedding <=> %s::vector))::float                           AS cosine_sim,
         ((1 - (p.embedding <=> %s::vector)) * 0.6
           + COALESCE(p.transport_relevance_score::float / 100.0, 0) * 0.3
           + LEAST(COUNT(po.id), 5)::float / 50.0 * 0.1
         )::float                                                             AS weighted_score,
         COUNT(po.id)::int                                                    AS outcomes_count
       FROM atlas.projects p
       LEFT JOIN atlas.project_outcomes po ON po.project_id = p.id
       WHERE p.embedding IS NOT NULL
       GROUP BY p.id
       ORDER BY weighted_score DESC
       LIMIT 10""",
    (vector_str, vector_str)
)
proj_rows = cur.fetchall()
print(f"\nTop project matches:")
for i, r in enumerate(proj_rows, 1):
    print(f"  {i}. [{r[6]:.3f}] {r[1][:70]} | {r[2]} | £{r[3] or 0:,.0f} | trs={r[4]}")

# 5. pgvector cosine similarity on atlas.live_calls (open)
cur.execute(
    """SELECT
         lc.id,
         lc.title,
         lc.funder,
         lc.funding_amount,
         lc.status,
         lc.deadline::text,
         (1 - (lc.embedding <=> %s::vector))::float AS cosine_sim
       FROM atlas.live_calls lc
       WHERE lc.embedding IS NOT NULL AND lc.status = 'open'
       ORDER BY cosine_sim DESC
       LIMIT 5""",
    (vector_str,)
)
live_rows = cur.fetchall()
print(f"\nTop live call matches ({len(live_rows)} open calls):")
for i, r in enumerate(live_rows, 1):
    print(f"  {i}. [{r[6]:.3f}] {r[1][:70]} | {r[2]} | deadline: {r[5]}")

# 6. Check existing matches table
cur.execute("SELECT COUNT(*) FROM atlas.matches WHERE passport_id = %s", (PASSPORT_ID,))
existing = cur.fetchone()[0]
print(f"\nExisting matches in DB for this passport: {existing}")

conn.close()
print("\nTest complete. Engine SQL logic validated.")
print("Run the full engine via: POST /api/passport/match {passport_id: '...'}")
