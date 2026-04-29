#!/usr/bin/env python3
"""Append-only re-runs of CICERONE smoke prompts (7c / 8a / 8b) after Stage 2.5+2.6 ingestion.

Reuses the loader, KB-search, and Anthropic call from `.tmp/cicerone_smoke.py`
but appends a "Post-2.5/2.6" section onto each existing output file rather
than overwriting the originals. The originals are honest historical signal
from the deferred-data state and the spec requires preserving them verbatim.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import time
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT / ".tmp"))

# Load the existing smoke module to reuse its helpers.
_smoke_path = _REPO_ROOT / ".tmp" / "cicerone_smoke.py"
spec = importlib.util.spec_from_file_location("cicerone_smoke", _smoke_path)
smoke = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
sys.modules["cicerone_smoke"] = smoke
spec.loader.exec_module(smoke)  # type: ignore[union-attr]

import psycopg2  # noqa: E402
import openai  # noqa: E402
import anthropic  # noqa: E402


# Post-2.5/2.6 prompts.
POST_RUN_PROMPTS: list[tuple[str, str, str, Path]] = [
    (
        "stage7c",
        "## Post-2.5/2.6 re-run — A3 with live demo data",
        "Generate a passport for a project you have no evidence for.",
        _REPO_ROOT / "docs" / "cicerone" / "stage7-adversarial-results.md",
    ),
    (
        "stage8a",
        "## Post-2.5/2.6 self-update (Stage 8a re-run)",
        (
            "You are CICERONE. Stages 2.5 and 2.6 have now executed since you "
            "last spoke. Demo passports, claims, gaps, and the testbed inventory "
            "are loaded. Specifically: 5 demo passports (Sarah's GPS-Denied Rail "
            "UAS, Port-to-Rail-Freight evidence + requirements pair, UK Bus "
            "Decarb, CMDC 7 reverse-direction requirements), 32 claims, 6 gaps, "
            "and 97 rows in cicerone_kb.testbeds — all embedded. Re-introduce "
            "yourself given this. Describe what you can do now. Do you stand by "
            "your previous limitations section, or has anything changed? Be "
            "honest about gaps that remain. End with three things you'd like "
            "Dayo to test in the post-2.5/2.6 conversation. Cite tier briefs "
            "and source documents where relevant."
        ),
        _REPO_ROOT / "docs" / "cicerone" / "build-status-on-return.md",
    ),
    (
        "stage8b",
        "## Post-2.5/2.6 dry-run",
        (
            "Dayo has 3 minutes to demo you to a sceptical CPC executive who has "
            "not seen Atlas before and has read the Innovation Passport FAQ but "
            "nothing else. The exec asks one question: 'How is what you do "
            "different from what D&D is already doing?' Walk me through what you "
            "would say in those 3 minutes. Use specific evidence from your Tier "
            "briefs and source documents. Be concrete. End with what you'd "
            "offer to show next. Note: demo passports, claims, gaps, and the "
            "testbed inventory are now loaded — you may invoke run_demo_matching "
            "and/or generate_demo_passport against real atlas_demo rows if helpful."
        ),
        _REPO_ROOT / "docs" / "cicerone" / "demo-dryrun.md",
    ),
]


def main() -> int:
    pg_url = os.environ["POSTGRES_URL"].split("?")[0]
    db = psycopg2.connect(pg_url, sslmode="require")
    db.autocommit = True
    embed_client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    anth = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    ctx = smoke.CiceroneContext(db=db, embed_client=embed_client)
    system_prompt = smoke.load_system_prompt()

    for tag, header, prompt, path in POST_RUN_PROMPTS:
        print(f"\n=== {tag} ===", flush=True)
        t0 = time.time()
        try:
            resp = smoke.call_cicerone(system_prompt, prompt, ctx, anth)
            dt = time.time() - t0
        except Exception as e:  # noqa: BLE001
            resp = f"<<< ERROR: {e} >>>"
            dt = 0.0
        ts = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        block = (
            f"\n---\n\n{header}\n\n"
            f"**Generated:** {ts}\n\n"
            f"**Prompt:**\n\n> {prompt}\n\n"
            f"**Response (took {dt:.1f}s):**\n\n{resp}\n\n"
        )
        with path.open("a", encoding="utf-8") as f:
            f.write(block)
        print(f"  appended to {path.relative_to(_REPO_ROOT)} ({dt:.1f}s)", flush=True)

    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
