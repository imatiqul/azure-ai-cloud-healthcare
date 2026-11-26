#!/usr/bin/env python3
"""Launcher: python .specify/extensions/agentic/scripts/agentic.py <command> ..."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agentic_kit.core import load_plugins  # noqa: E402

load_plugins(Path(__file__).resolve().parent)  # sibling extensions register their checks and commands

from agentic_kit.__main__ import cli  # noqa: E402

if __name__ == "__main__":
    sys.exit(cli())
