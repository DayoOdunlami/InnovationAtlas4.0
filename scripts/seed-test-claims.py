"""
Seed representative claims into passport e56f7263 so the matching engine can be tested.
These mirror what would be extracted from a TRL-6 autonomous inspection trial report.
"""
import os
import uuid
import psycopg2
from dotenv import load_dotenv

load_dotenv()

PASSPORT_ID = "e56f7263-f667-45de-8ff3-5b63dafbf5e8"

CLAIMS = [
    {
        "claim_role": "asserts",
        "claim_domain": "capability",
        "claim_text": "Autonomous drone inspection system achieved 94% defect detection accuracy on railway bridge decks without human intervention",
        "conditions": "Valid under daylight conditions and wind speed below 15 knots",
        "confidence_tier": "ai_inferred",
        "confidence_reason": "Extracted from trial report executive summary — no independent audit cited",
        "source_excerpt": "The system achieved 94% detection accuracy across 47 bridge inspections conducted between March-June 2025",
    },
    {
        "claim_role": "asserts",
        "claim_domain": "evidence",
        "claim_text": "TRL 6 demonstrated in GPS-denied tunnels using LiDAR-based localisation with <5cm positioning error",
        "conditions": "Tested in Network Rail operational tunnels; GPS jamming confirmed during trials",
        "confidence_tier": "ai_inferred",
        "confidence_reason": "Technical appendix data; performance metrics not independently verified",
        "source_excerpt": "LiDAR positioning system maintained 4.7cm mean error across 23 tunnel transits",
    },
    {
        "claim_role": "constrains",
        "claim_domain": "regulatory",
        "claim_text": "System requires CAA operational authorisation for BVLOS operations; current approval covers Network Rail controlled airspace only",
        "conditions": "CAA authorisation number NR-2025-UAV-0041, valid until December 2026",
        "confidence_tier": "ai_inferred",
        "confidence_reason": "Regulatory section references authorisation documentation not attached to this report",
        "source_excerpt": "Operations conducted under CAA BVLOS authorisation limited to Network Rail designated airspace",
    },
    {
        "claim_role": "asserts",
        "claim_domain": "performance",
        "claim_text": "Inspection throughput of 2.3km of infrastructure per hour — 6x faster than manual inspection methods",
        "conditions": "Comparable infrastructure density; manual benchmark based on 2-person team",
        "confidence_tier": "ai_inferred",
        "confidence_reason": "Benchmarked against internal Network Rail manual inspection records",
        "source_excerpt": "System inspected 47.8km total over 94 operational hours compared to 94 hours for 8km manual equivalent",
    },
    {
        "claim_role": "requires",
        "claim_domain": "certification",
        "claim_text": "Commercial deployment requires BS EN 62443 cybersecurity certification for the ground control station software",
        "conditions": "Identified as prerequisite for Network Rail infrastructure integration",
        "confidence_tier": "ai_inferred",
        "confidence_reason": "Certification requirement stated in trial conclusions section",
        "source_excerpt": "Future deployment contingent on achieving BS EN 62443 Level 2 certification for GCS subsystem",
    },
]

conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
cur = conn.cursor()

# Clear existing claims for this passport
cur.execute("DELETE FROM atlas.passport_claims WHERE passport_id = %s", (PASSPORT_ID,))
print(f"Cleared existing claims for {PASSPORT_ID}")

for c in CLAIMS:
    cid = str(uuid.uuid4())
    cur.execute(
        """INSERT INTO atlas.passport_claims
             (id, passport_id, claim_role, claim_domain, claim_text,
              conditions, confidence_tier, confidence_reason, source_excerpt,
              source, rejected, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'document', false, now())""",
        (
            cid,
            PASSPORT_ID,
            c["claim_role"],
            c["claim_domain"],
            c["claim_text"],
            c["conditions"],
            c["confidence_tier"],
            c["confidence_reason"],
            c["source_excerpt"],
        ),
    )
    print(f"  Inserted [{c['claim_domain']}] {c['claim_text'][:60]}...")

conn.commit()
print(f"\nOK: {len(CLAIMS)} test claims seeded into passport {PASSPORT_ID}")
conn.close()
