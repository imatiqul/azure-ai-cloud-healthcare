"""Shared helpers for the product extension."""
from __future__ import annotations

import hashlib
import re

from agentic_kit.checks_gov import required_gates, spec_front
from agentic_kit.core import KIT_DIR, Context, KitError, evidence_hash
from agentic_kit.lanes import approved_records

PRODUCT = f"{KIT_DIR}/product"
INDEX = f"{PRODUCT}/index.yml"
GLOSSARY = f"{PRODUCT}/glossary.yml"
INDEX_SCHEMA = "agentic-product-index/1"

FR = re.compile(r"^\s*[-*]\s*\*\*(FR-[0-9]{3,})\*\*\s*:?\s*(.*)$", re.M)
AC = re.compile(r"^\s*[-*]\s*\*\*(AC-[0-9]{3,})\*\*\s*\(verifies\s+((?:FR-[0-9]{3,}[,\s]*)+)\)[^:]*:\s*(.*)$", re.M)
_FRONT = re.compile(r"\A---\s*\n.*?\n---\s*(?:\n|\Z)", re.S)


def sha(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def cfg(ctx: Context) -> dict:
    return ctx.kit().get("product") or {}


def body_of(text: str) -> str:
    """A Markdown file without its front matter."""
    return _FRONT.sub("", text, count=1)


def spec_text(ctx: Context, spec: str) -> str:
    return ctx.src.read(f"specs/{spec}/spec.md")


def spec_title(ctx: Context, spec: str) -> str:
    m = re.search(r"^#\s+(?:Feature Specification:\s*)?(.+?)\s*$", body_of(spec_text(ctx, spec)), re.M)
    return m.group(1) if m else spec


def requirements(ctx: Context, spec: str) -> dict[str, str]:
    """FR id -> statement."""
    return {m.group(1): m.group(2).strip() for m in FR.finditer(spec_text(ctx, spec))}


def criteria(ctx: Context, spec: str) -> dict[str, tuple[list[str], str]]:
    """AC id -> (the FR ids it verifies, statement)."""
    return {m.group(1): (re.findall(r"FR-[0-9]{3,}", m.group(2)), m.group(3).strip()) for m in AC.finditer(spec_text(ctx, spec))}


def index(ctx: Context) -> dict | None:
    """The product index, or None when living specs are not in use in this repository."""
    if not ctx.src.exists(INDEX):
        return None
    data = ctx.src.yaml(INDEX)
    if not isinstance(data, dict) or data.get("schema") != INDEX_SCHEMA:
        raise KitError(f"{INDEX} must be a mapping with schema {INDEX_SCHEMA}")
    return data


def merged(ctx: Context) -> list[str]:
    return [str(x) for x in ((index(ctx) or {}).get("order") or [])]


def exempt(ctx: Context) -> set[str]:
    """Specs that existed before living specs were adopted. Read from the base branch, so a change cannot exempt itself."""
    holder = ctx.trusted if ctx.trusted.exists(INDEX) else ctx.src
    if not holder.exists(INDEX):
        return set()
    return {str(x) for x in ((holder.yaml(INDEX) or {}).get("exempt") or [])}


def first_gate(ctx: Context, spec: str) -> str:
    return required_gates(ctx, spec)[0]


def is_open(ctx: Context, spec: str) -> bool:
    """Is the spec's wording still to be approved? True until its first gate is approved, and again if it changes after."""
    found = approved_records(ctx, spec).get(first_gate(ctx, spec))
    if not found:
        return True
    evidence = found[1].get("evidence") or {}
    files = [str(f) for f in evidence.get("files") or []]
    try:
        return evidence_hash(ctx.src, spec, first_gate(ctx, spec), files) != evidence.get("hash")
    except KitError:
        return True


def in_scope(ctx: Context) -> list[str]:
    """Specs the product checks apply to: every spec that was not there before adoption."""
    skip = exempt(ctx)
    return [s for s in ctx.specs() if s not in skip]


def front(ctx: Context, spec: str) -> dict:
    return spec_front(ctx, spec)
