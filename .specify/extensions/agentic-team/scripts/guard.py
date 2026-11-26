#!/usr/bin/env python3
"""Pre-tool-use event script for the agentic-team extension. Reads one tool call as JSON on stdin.

Exit 0 allows the call. Exit 2 blocks it; the reason is written to stderr.
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent                      # <extensions>/agentic-team/scripts
CORE = HERE.parent.parent / "agentic" / "scripts"           # <extensions>/agentic/scripts
sys.dont_write_bytecode = True
sys.path.insert(0, str(CORE))

try:
    from agentic_kit import core
    core.load_plugins(CORE)
    from agentic_kit.__main__ import main
except Exception as exc:  # noqa: BLE001 - the kit is not installed correctly; say so without blocking unrelated work
    print(f"agentic path guard is not active: {exc}", file=sys.stderr)
    sys.exit(0)

sys.exit(main(["--root", os.getcwd(), "guard"]))
