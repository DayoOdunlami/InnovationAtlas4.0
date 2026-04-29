#!/usr/bin/env python3
"""Stage 2.5 — Demo evidence pack ingestion for CICERONE.

Parses the four `cicerone-pack-{1..4}.md` files, extracts ```yaml fenced blocks,
and inserts:
  - 5 atlas_demo.passports rows (is_demo=true, with text-embedding-3-small embedding)  pragma: allowlist secret
  - ~28 atlas_demo.passport_claims rows (FK to passports)
  - 6 atlas_demo.passport_gaps rows (FK to evidence_passport + requirements_passport)

Insertion order: pack 1, pack 2 (passport_a -> claims_a -> passport_b -> claims_b
-> gaps), pack 3, pack 4. This preserves FK resolution within Pack 2 (gaps need
both passport UUIDs).

Embedding text: title + summary + context + joined tags.

Idempotent: any pack-id key collision deletes prior demo rows for that pack
before re-inserting (we tag with extended_fields.pack_id).

Run:
  python3 .tmp/ingest_cicerone_packs.py
"""
# @ts-nocheck — N/A (Python file); keeping marker for grep parity with TS sources.

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[1]
_DOTENV = _REPO_ROOT / ".env"
if _DOTENV.exists():
    for line in _DOTENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)

import openai

EMBED_MODEL = "text-embedding-3-small"  # pragma: allowlist secret
PACKS_DIR = _REPO_ROOT / "docs" / "cicerone" / "demo-evidence-packs"

PACK_FILES = [
    ("demo_pack_sarah_gps_rail_uas", PACKS_DIR / "cicerone-pack-1-sarah.md"),
    ("demo_pack_port_to_rail_freight", PACKS_DIR / "cicerone-pack-2-cross-sector.md"),
    ("demo_pack_uk_bus_decarb_sparse", PACKS_DIR / "cicerone-pack-3-sparse.md"),
    ("demo_pack_reverse_call_to_evidence", PACKS_DIR / "cicerone-pack-4-reverse.md"),
]


def extract_yaml_blocks(path: Path) -> dict[str, Any]:
    """Extract all ```yaml fenced blocks and merge by top-level key."""
    text = path.read_text(encoding="utf-8")
    blocks: dict[str, Any] = {}
    for m in re.finditer(r"```yaml\s*\n(.*?)```", text, flags=re.DOTALL):
        chunk = m.group(1)
        try:
            data = yaml.safe_load(chunk)
        except yaml.YAMLError as e:
            print(f"  YAML parse error in {path.name}: {e}", flush=True)
            continue
        if isinstance(data, dict):
            for k, v in data.items():
                blocks[k] = v
    return blocks


def passport_embed_text(p: dict[str, Any]) -> str:
    parts: list[str] = []
    if p.get("title"):
        parts.append(str(p["title"]))
    if p.get("summary"):
        parts.append(str(p["summary"]))
    if p.get("context"):
        parts.append(str(p["context"]))
    tags = p.get("tags") or []
    if tags:
        parts.append(" ".join(str(t) for t in tags))
    return "\n\n".join(parts).strip()


def vec_literal(emb: list[float]) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in emb) + "]"


def insert_passport(
    cur, pack_id: str, p: dict[str, Any], embed_client: openai.OpenAI
) -> str:
    """Returns the inserted passport UUID."""
    # Build embedding
    text = passport_embed_text(p)
    emb = embed_client.embeddings.create(input=text, model=EMBED_MODEL).data[0].embedding
    ext = {"pack_id": pack_id}
    if p.get("approval_ref"):
        ext["approval_ref_orig"] = p["approval_ref"]

    # Normalise scalars
    def _date(v):
        return v if v else None

    cur.execute(
        """
        INSERT INTO atlas_demo.passports (
            passport_type, title, owner_org, owner_name, summary, context,
            trl_level, trl_target, sector_origin, sector_target,
            approval_body, approval_ref, approval_date, valid_conditions,
            trial_date_start, trial_date_end, domain, tags,
            is_demo, embedding, extended_fields
        )
        VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            true, %s::vector, %s::jsonb
        )
        RETURNING id
        """,
        (
            p["passport_type"],
            p["title"],
            p.get("owner_org"),
            p.get("owner_name"),
            p.get("summary"),
            p.get("context"),
            p.get("trl_level"),
            p.get("trl_target"),
            p.get("sector_origin") or [],
            p.get("sector_target") or [],
            p.get("approval_body"),
            p.get("approval_ref"),
            _date(p.get("approval_date")),
            p.get("valid_conditions"),
            _date(p.get("trial_date_start")),
            _date(p.get("trial_date_end")),
            p.get("domain") or "transport",
            p.get("tags") or [],
            vec_literal(emb),
            json.dumps(ext),
        ),
    )
    return cur.fetchone()[0]


def insert_claim(cur, passport_id: str, claim: dict[str, Any]) -> None:
    cur.execute(
        """
        INSERT INTO atlas_demo.passport_claims (
            passport_id, claim_role, claim_domain, claim_text,
            conditions, confidence_tier, confidence_reason, source_excerpt, source
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            passport_id,
            claim["claim_role"],
            claim["claim_domain"],
            (claim["claim_text"] or "").strip(),
            (claim.get("conditions") or None),
            claim.get("confidence_tier"),
            (claim.get("confidence_reason") or None),
            (claim.get("source_excerpt") or None),
            "demo_pack_ingest",
        ),
    )


def insert_gap(
    cur, evidence_passport_id: str, requirements_passport_id: str, gap: dict[str, Any]
) -> None:
    cur.execute(
        """
        INSERT INTO atlas_demo.passport_gaps (
            evidence_passport_id, requirements_passport_id,
            gap_description, gap_type, addressable_by, severity
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            evidence_passport_id,
            requirements_passport_id,
            (gap["gap_description"] or "").strip(),
            gap.get("gap_type"),
            (gap.get("addressable_by") or None),
            gap.get("severity"),
        ),
    )


def cleanup_existing(cur, pack_ids: list[str]) -> None:
    """Idempotency: remove any prior demo rows tagged with these pack_ids."""
    cur.execute(
        """
        DELETE FROM atlas_demo.passports
        WHERE is_demo = true
          AND extended_fields ? 'pack_id'
          AND extended_fields->>'pack_id' = ANY(%s)
        """,
        (pack_ids,),
    )


def main() -> int:
    pg_url = os.environ["POSTGRES_URL"].split("?")[0]
    db = psycopg2.connect(pg_url, sslmode="require")
    db.autocommit = False
    cur = db.cursor()
    embed_client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    summary: dict[str, Any] = {"packs": [], "totals": {"passports": 0, "claims": 0, "gaps": 0}}

    try:
        cleanup_existing(cur, [pid for pid, _ in PACK_FILES])

        for pack_id, path in PACK_FILES:
            print(f"[{pack_id}] parsing {path.name}", flush=True)
            blocks = extract_yaml_blocks(path)

            pack_summary: dict[str, Any] = {
                "pack_id": pack_id,
                "passports": [],
                "claims": 0,
                "gaps": 0,
            }

            if pack_id == "demo_pack_port_to_rail_freight":
                pa = blocks["passport_a"]
                pb = blocks["passport_b"]
                claims_a = blocks.get("claims_a", []) or []
                claims_b = blocks.get("claims_b", []) or []
                gaps = blocks.get("gaps", []) or []

                pa_id = insert_passport(cur, pack_id, pa, embed_client)
                pack_summary["passports"].append({"role": "evidence", "id": pa_id, "title": pa["title"]})
                summary["totals"]["passports"] += 1
                for c in claims_a:
                    insert_claim(cur, pa_id, c)
                pack_summary["claims"] += len(claims_a)
                summary["totals"]["claims"] += len(claims_a)

                pb_id = insert_passport(cur, pack_id, pb, embed_client)
                pack_summary["passports"].append({"role": "requirements", "id": pb_id, "title": pb["title"]})
                summary["totals"]["passports"] += 1
                for c in claims_b:
                    insert_claim(cur, pb_id, c)
                pack_summary["claims"] += len(claims_b)
                summary["totals"]["claims"] += len(claims_b)

                for g in gaps:
                    insert_gap(cur, pa_id, pb_id, g)
                pack_summary["gaps"] += len(gaps)
                summary["totals"]["gaps"] += len(gaps)
            else:
                p = blocks["passport"]
                # Pack 1, 3 use `claims:`, Pack 4 uses `required_claims:`.
                claims = blocks.get("claims") or blocks.get("required_claims") or []
                p_id = insert_passport(cur, pack_id, p, embed_client)
                role = "requirements" if p["passport_type"] == "requirements_profile" else "evidence"
                pack_summary["passports"].append({"role": role, "id": p_id, "title": p["title"]})
                summary["totals"]["passports"] += 1
                for c in claims:
                    insert_claim(cur, p_id, c)
                pack_summary["claims"] += len(claims)
                summary["totals"]["claims"] += len(claims)

            summary["packs"].append(pack_summary)
            print(
                f"  -> {len(pack_summary['passports'])} passport(s), "
                f"{pack_summary['claims']} claim(s), "
                f"{pack_summary['gaps']} gap(s)",
                flush=True,
            )

        db.commit()
        print("\n=== INGESTION COMPLETE ===")
        print(json.dumps(summary, indent=2, default=str))
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        raise
    finally:
        cur.close()
        db.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
