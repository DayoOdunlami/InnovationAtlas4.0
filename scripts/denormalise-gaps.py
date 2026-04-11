"""
Denormalise gaps from atlas.matches → atlas.passport_gaps.
Mirrors the TypeScript denormaliseGaps() in src/lib/passport/matching.ts.

Can be run standalone to populate atlas.passport_gaps for any passport,
or used for testing after the matching engine has written gaps to atlas.matches.
"""
import os
import uuid
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv()

PASSPORT_ID = os.environ.get("PASSPORT_ID", "e56f7263-f667-45de-8ff3-5b63dafbf5e8")

# ── Mapping tables (mirror matching.ts) ───────────────────────────────────

GAP_TYPE_MAP = {
    "missing_evidence":    "missing_evidence",
    "trl_gap":             "trl_gap",
    "sector_gap":          "sector_gap",
    "certification_gap":   "certification_gap",
    "conditions_mismatch": "conditions_mismatch",
    "technology":          "missing_evidence",
    "capability":          "missing_evidence",
    "scope":               "sector_gap",
    "application":         "sector_gap",
    "domain":              "sector_gap",
    "certification":       "certification_gap",
    "regulatory":          "conditions_mismatch",
    "regulation":          "conditions_mismatch",
    "conditions":          "conditions_mismatch",
    "trl":                 "trl_gap",
    "readiness":           "trl_gap",
    "evidence":            "missing_evidence",
    "data":                "missing_evidence",
}

SEVERITY_MAP = {
    "blocking":    "blocking",
    "significant": "significant",
    "minor":       "minor",
    "high":        "blocking",
    "medium":      "significant",
    "low":         "minor",
    "critical":    "blocking",
    "moderate":    "significant",
    "negligible":  "minor",
}

ADDRESSABLE_DEFAULTS = {
    "missing_evidence":    "Provide documented evidence or trial data demonstrating this capability claim",
    "trl_gap":             "Increase TRL through controlled field trials or independent validation activities",
    "sector_gap":          "Identify and document a sector translation pathway or equivalent cross-sector use case",
    "certification_gap":   "Obtain the relevant certification or demonstrate standards compliance",
    "conditions_mismatch": "Provide evidence collected under the required conditions, or document accepted equivalence",
}

SEVERITY_RANK = {"blocking": 3, "significant": 2, "minor": 1}


def map_gap_type(raw):
    return GAP_TYPE_MAP.get((raw or "").lower().strip(), "missing_evidence")


def map_severity(raw):
    return SEVERITY_MAP.get((raw or "").lower().strip(), "significant")


def denormalise_gaps(conn, passport_id):
    cur = conn.cursor()

    # 1. Clear existing
    cur.execute(
        "DELETE FROM atlas.passport_gaps WHERE evidence_passport_id = %s",
        (passport_id,)
    )

    # 2. Load gaps from matches
    cur.execute(
        """SELECT gaps FROM atlas.matches
           WHERE passport_id = %s AND gaps IS NOT NULL AND gaps != '[]'::jsonb""",
        (passport_id,)
    )
    rows = cur.fetchall()

    # 3. Collect + deduplicate
    seen = {}  # key → {gap_type, severity, gap_description, addressable_by}
    for (gaps_raw,) in rows:
        gaps = gaps_raw if isinstance(gaps_raw, list) else json.loads(gaps_raw)
        for gap in gaps:
            desc = gap.get("gap_description", "")
            if not desc:
                continue
            canonical_type = map_gap_type(gap.get("gap_type"))
            canonical_sev  = map_severity(gap.get("severity"))
            dedup_key = f"{canonical_type}:{desc.lower()[:60]}"

            existing = seen.get(dedup_key)
            if not existing or SEVERITY_RANK[canonical_sev] > SEVERITY_RANK[existing["severity"]]:
                seen[dedup_key] = {
                    "gap_type":        canonical_type,
                    "severity":        canonical_sev,
                    "gap_description": desc,
                    "addressable_by":  gap.get("addressable_by") or ADDRESSABLE_DEFAULTS[canonical_type],
                }

    # 4. Insert
    for g in seen.values():
        cur.execute(
            """INSERT INTO atlas.passport_gaps
                 (id, evidence_passport_id, gap_type, severity,
                  gap_description, addressable_by, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, now())""",
            (str(uuid.uuid4()), passport_id,
             g["gap_type"], g["severity"],
             g["gap_description"], g["addressable_by"])
        )

    conn.commit()
    return len(seen)


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], sslmode="require")
    print(f"\nPassport: {PASSPORT_ID}")

    # Check input
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM atlas.matches WHERE passport_id = %s AND gaps IS NOT NULL AND gaps != '[]'::jsonb",
        (PASSPORT_ID,)
    )
    matches_with_gaps = cur.fetchone()[0]
    print(f"Matches with gaps: {matches_with_gaps}")

    count = denormalise_gaps(conn, PASSPORT_ID)
    print(f"Gaps written to atlas.passport_gaps: {count}")

    # Verify
    cur.execute(
        """SELECT gap_type, severity, gap_description, addressable_by
           FROM atlas.passport_gaps
           WHERE evidence_passport_id = %s
           ORDER BY CASE severity
             WHEN 'blocking' THEN 1
             WHEN 'significant' THEN 2
             ELSE 3
           END""",
        (PASSPORT_ID,)
    )
    gaps = cur.fetchall()
    print(f"\natlas.passport_gaps rows: {len(gaps)}")
    for g in gaps:
        print(f"  [{g[1]:11s}] [{g[0]:20s}] {g[2][:72]}")
        if g[3]:
            print(f"               addressable_by: {g[3][:70]}")

    conn.close()
    assert len(gaps) > 0, "No gaps written — FAIL"
    print("\nStep 14 PASSED: atlas.passport_gaps is populated")


if __name__ == "__main__":
    main()
