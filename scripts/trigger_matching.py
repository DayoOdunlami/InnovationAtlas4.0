"""
Run full passport matching refresh (TS implementation).

Calls: pnpm exec tsx scripts/trigger-matching-all.ts
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    cmd = ["pnpm", "exec", "tsx", "scripts/trigger-matching-all.ts"]
    env = {**os.environ}
    print("Running:", " ".join(cmd), flush=True)
    subprocess.check_call(cmd, cwd=str(ROOT), env=env)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        sys.exit(1)
