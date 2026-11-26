"""Requirement quality (PRD-1 to PRD-5): wording an agent cannot misread, agreed terms, and a size a person can review.

These checks look at a spec while its wording is still to be approved: before its first gate, and again whenever the
spec changes after that gate. Once a named person has approved the wording, the checks stay quiet.
"""
from __future__ import annotations

import re

from agentic_kit.core import Context, Result, check

from . import common
from .common import GLOSSARY

WEAK = ["fast", "quick", "quickly", "easy", "easily", "simple", "simply", "user-friendly", "user friendly", "intuitive", "robust", "flexible",
        "seamless", "seamlessly", "efficient", "efficiently", "scalable", "appropriate", "appropriately", "adequate", "reasonable", "reasonably",
        "sufficient", "optimal", "minimal", "as needed", "if possible", "where possible", "as soon as possible", "and/or", "etc", "tbd", "todo",
        "approximately", "normally", "usually", "generally", "state-of-the-art", "best effort", "timely", "modern"]
LIMITS = {"requirements": 15, "criteria": 45, "lines": 500}
STYLES = ("gherkin", "ears", "any")
EARS = re.compile(r"^\s*(?:(?:when|while|where|if)\b.+?,\s*(?:then\s+)?)?the\s+.+?\s+(?:shall|must)\b", re.I)
_MODAL = re.compile(r"\b(must|shall)\b", re.I)
_CLARIFY = re.compile(r"\[NEEDS CLARIFICATION", re.I)


def settings(ctx: Context) -> dict:
    return ctx.kit().get("requirements") or {}


def weak_words(ctx: Context) -> list[str]:
    cfg = settings(ctx)
    allowed = {str(w).lower() for w in cfg.get("allow_words") or []}
    return [w for w in WEAK + [str(x).lower() for x in cfg.get("weak_words") or []] if w not in allowed]


def vague(statement: str, weak: list[str]) -> list[str]:
    """Weak words in a statement that carries no number to pin them down."""
    if re.search(r"\d", statement):
        return []
    low = statement.lower()
    return [w for w in weak if re.search(rf"(?<![\w-]){re.escape(w)}(?![\w-])", low)]


def lint_statement(rid: str, statement: str, weak: list[str], style: str) -> list[str]:
    out = []
    modals = _MODAL.findall(statement)
    if not modals:
        out.append(f"{rid} does not say MUST or SHALL; 'should' and 'may' leave it to the reader")
    elif len(modals) > 1:
        out.append(f"{rid} states {len(modals)} obligations in one requirement; split it so each can be tested and traced on its own")
    words = vague(statement, weak)
    if words:
        out.append(f"{rid} uses {', '.join(repr(w) for w in words)} with no number; say what would be measured")
    if style == "ears" and not EARS.search(statement):
        out.append(f"{rid} is not in an EARS form (for example: 'When <trigger>, the <system> shall <response>')")
    return out


def glossary(ctx: Context) -> tuple[list[dict], list[str]]:
    """(terms, problems). Read from the base branch like other rules, so a change cannot redefine a term it misuses."""
    holder = ctx.trusted if ctx.trusted.exists(GLOSSARY) else ctx.src
    if not holder.exists(GLOSSARY):
        return [], []
    data = holder.yaml(GLOSSARY)
    terms = (data or {}).get("terms") if isinstance(data, dict) else None
    if not isinstance(terms, list):
        return [], ["the glossary must have a `terms` list"]
    problems, names = [], set()
    for t in terms:
        if not isinstance(t, dict) or not t.get("term") or not str(t.get("definition") or "").strip():
            problems.append(f"each term needs `term` and `definition` ({t!r})")
            continue
        if str(t["term"]).lower() in names:
            problems.append(f"term {t['term']!r} is defined twice")
        names.add(str(t["term"]).lower())
    for t in terms:
        for syn in (t.get("avoid") or []) if isinstance(t, dict) else []:
            if str(syn).lower() in names:
                problems.append(f"{syn!r} is listed as a word to avoid for {t.get('term')!r} and is also a term of its own")
    return [t for t in terms if isinstance(t, dict) and t.get("term")], problems


def synonyms(ctx: Context) -> dict[str, str]:
    """Avoided word -> the agreed term."""
    return {str(s).lower(): str(t["term"]).lower() for t in glossary(ctx)[0] for s in (t.get("avoid") or [])}


def open_specs(ctx: Context) -> list[str]:
    done = set(common.merged(ctx))
    return [s for s in common.in_scope(ctx) if s not in done and common.is_open(ctx, s)]


@check("CK-REQ-QUALITY", ("PRD-1", "PRD-2", "PRD-3"), "requirements still to be approved are single, testable obligations with no open question")
def ck_req_quality(ctx: Context, res: Result) -> None:
    cfg = settings(ctx)
    style = str(cfg.get("style", "gherkin"))
    if style not in STYLES:
        res.fail(f"kit.yml requirements.style must be one of {', '.join(STYLES)}")
        return
    weak = weak_words(ctx)
    from .living import spec_deltas
    for spec in open_specs(ctx):
        rel = f"specs/{spec}/spec.md"
        frs, acs = common.requirements(ctx, spec), common.criteria(ctx, spec)
        if not frs:
            res.fail("the spec has no requirement of the form - **FR-001**: ...", rel)
        for fid, statement in frs.items():
            for problem in lint_statement(fid, statement, weak, style):
                res.fail(problem, rel)
            if not any(fid in verified for verified, _ in acs.values()):
                res.fail(f"{fid} has no acceptance criterion, so nothing can show it is met", rel)
        for aid, (verified, statement) in acs.items():
            for fid in verified:
                if fid not in frs:
                    res.fail(f"{aid} verifies {fid}, which the spec does not have", rel)
            low = statement.lower()
            if style != "any" and not ("when" in low and "then" in low):
                res.fail(f"{aid} needs a When and a Then, so a test can be written from it", rel)
            words = vague(statement, weak)
            if words:
                res.fail(f"{aid} uses {', '.join(repr(w) for w in words)} with no number; a test cannot check it", rel)
        if _CLARIFY.search(common.spec_text(ctx, spec)):
            res.fail("the spec still has an open [NEEDS CLARIFICATION] marker; answer it or take the requirement out before the gate", rel)
        for d in spec_deltas(ctx, spec):
            for r in d.added + d.modified:
                words = vague(r.body, weak)
                if words:
                    res.fail(f"requirement '{r.name}' uses {', '.join(repr(w) for w in words)} with no number", d.rel)


@check("CK-SPEC-SIZE", ("PRD-4",), "a spec still to be approved is small enough for one person to review")
def ck_spec_size(ctx: Context, res: Result) -> None:
    limits = {**LIMITS, **{k: int(v) for k, v in (settings(ctx).get("limits") or {}).items() if k in LIMITS}}
    for spec in open_specs(ctx):
        rel = f"specs/{spec}/spec.md"
        counts = {"requirements": len(common.requirements(ctx, spec)), "criteria": len(common.criteria(ctx, spec)),
                  "lines": len(common.spec_text(ctx, spec).splitlines())}
        for name, n in counts.items():
            if n > limits[name]:
                res.fail(f"the spec has {n} {name}; the limit is {limits[name]}. Split it into specs a reviewer can hold in their head, "
                         "and order them with `after:`", rel)


@check("CK-GLOSSARY", ("PRD-5",), "specs still to be approved use the agreed term for each idea, not a synonym")
def ck_glossary(ctx: Context, res: Result) -> None:
    terms, problems = glossary(ctx)
    for p in problems:
        res.fail(p, GLOSSARY)
    if not terms:
        if not problems:
            res.notes.append("no glossary; create .specify/agentic/product/glossary.yml to hold agreed terms")
        return
    avoid = synonyms(ctx)
    from .living import spec_deltas
    for spec in open_specs(ctx):
        texts = [(f"specs/{spec}/spec.md", common.body_of(common.spec_text(ctx, spec)))]
        texts += [(d.rel, common.body_of(ctx.src.read(d.rel))) for d in spec_deltas(ctx, spec)]
        for rel, text in texts:
            low = re.sub(r"`[^`]*`", " ", text.lower())
            for word, term in sorted(avoid.items()):
                n = len(re.findall(rf"(?<![\w-]){re.escape(word)}s?(?![\w-])", low))
                if n:
                    res.fail(f"'{word}' appears {n} time(s); the agreed term is '{term}'. Two words for one idea read as two ideas", rel)
