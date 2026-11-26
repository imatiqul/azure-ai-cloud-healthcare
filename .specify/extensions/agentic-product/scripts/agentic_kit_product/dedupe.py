"""Duplicate and already-delivered requirements (INT-5, INT-6).

The kit proposes; a person decides. Each incoming requirement and each spec still to be approved is compared with
what the system already does (the living specs), with every other spec, and with the other intake records. A match
above the threshold is a candidate. The spec cannot pass its first gate until a Product Owner has recorded, for each
candidate, whether it is the same thing or not and why.
"""
from __future__ import annotations

from dataclasses import dataclass

from agentic_kit.core import Context, Result, check
from agentic_kit.lanes import complete

from . import common, intake, text
from .lint import open_specs, synonyms
from .living import capabilities

ORIGIN = "origin.yml"
THRESHOLD = 0.3
STRONG = 0.6
DECISIONS = ("distinct", "extends", "supersedes", "duplicate-of", "already-delivered")
STOPPING = ("duplicate-of", "already-delivered")


@dataclass
class Target:
    kind: str      # delivered | in-flight | intake
    ref: str       # capability:<id>#<requirement>, a spec id, or an intake record id
    title: str
    body: str


def threshold(ctx: Context) -> float:
    return float(((ctx.kit().get("intake") or {}).get("dedupe") or {}).get("threshold", THRESHOLD))


def targets(ctx: Context) -> list[Target]:
    out = []
    for cid, cap in capabilities(ctx).items():
        for r in cap.requirements.values():
            out.append(Target("delivered", f"capability:{cid}#{r.name}", r.name, r.body + "\n" + "\n".join(b for _, b in r.scenarios)))
    done = set(common.merged(ctx))
    by_id = {str(r.get("id")): r for _, r in intake.records(ctx)}
    for spec in ctx.specs():
        if spec in done:
            continue  # its behaviour is in the living specs already
        frs = common.requirements(ctx, spec)
        asked = [f"{r.get('title', '')}\n{r.get('body', '')}" for r in by_id.values() if str(r.get("spec")) == spec]  # the words it was asked for in
        out.append(Target("delivered" if complete(ctx, spec) else "in-flight", spec, common.spec_title(ctx, spec), "\n".join(list(frs.values()) + asked)))
    for rec in by_id.values():
        if rec.get("status") in ("new", "triaged"):
            out.append(Target("intake", str(rec.get("id")), str(rec.get("title", "")), str(rec.get("body", ""))))
    return out


def candidates(ctx: Context, title: str, body: str, exclude: set[str] = frozenset()) -> list[dict]:
    """Targets that share enough vocabulary with this requirement, most alike first."""
    syn = synonyms(ctx)
    pool = [t for t in targets(ctx) if t.ref not in exclude]
    docs = [text.features(f"{t.title}\n{t.body}", syn) for t in pool]
    mine = text.features(f"{title}\n{body}", syn)
    weights = text.idf(docs + [mine])
    limit = threshold(ctx)
    out = []
    for t, doc in zip(pool, docs):
        cos, shared = text.cosine(mine, doc, weights)
        score = round(max(cos, (cos + text.jaccard(title, t.title, syn)) / 2), 2)
        if score >= limit:
            out.append({"target": t.ref, "kind": t.kind, "score": score, "shared": shared, "strength": "strong" if score >= STRONG else "possible"})
    return sorted(out, key=lambda c: (-c["score"], c["target"]))


def origin(ctx: Context, spec: str) -> dict:
    rel = f"specs/{spec}/{ORIGIN}"
    data = ctx.src.yaml(rel) if ctx.src.exists(rel) else {}
    return data if isinstance(data, dict) else {}


def spec_candidates(ctx: Context, spec: str) -> list[dict]:
    """Computed candidates for a spec, plus any an agent or a person listed in origin.yml."""
    from .living import key, spec_deltas
    org = origin(ctx, spec)
    mine = {spec} | {str(i) for i in org.get("intake") or []}
    # A requirement this spec's own delta modifies, removes or renames is declared related already: it is not a candidate.
    changed = {(d.capability, key(n)) for d in spec_deltas(ctx, spec) for n in [r.name for r in d.modified + d.removed] + [a for a, _ in d.renamed]}
    mine |= {f"capability:{cid}#{r.name}" for cid, cap in capabilities(ctx).items() for r in cap.requirements.values() if (cid, key(r.name)) in changed}
    found = candidates(ctx, common.spec_title(ctx, spec), "\n".join(common.requirements(ctx, spec).values()), mine)
    known = {c["target"] for c in found}
    for c in org.get("candidates") or []:
        if isinstance(c, dict) and c.get("target") and str(c["target"]) not in known | mine:
            found.append({"target": str(c["target"]), "kind": str(c.get("kind", "listed")), "score": c.get("score"), "shared": [],
                          "strength": "listed", "suggested_by": c.get("suggested_by", "")})
    return found


def describe(c: dict) -> str:
    score = f"{c['score']:.2f}" if isinstance(c.get("score"), (int, float)) else "listed by hand"
    shared = f"; shares {', '.join(c['shared'])}" if c.get("shared") else ""
    return f"{c['target']} ({c['kind']}, {score}{shared})"


@check("CK-DUPLICATE", ("INT-5", "INT-6"), "before a spec's first gate, a Product Owner has decided every likely duplicate of it")
def ck_duplicate(ctx: Context, res: Result) -> None:
    for spec in open_specs(ctx):
        rel = f"specs/{spec}/{ORIGIN}"
        decided = {}
        for d in origin(ctx, spec).get("dispositions") or []:
            if isinstance(d, dict) and d.get("target"):
                decided[str(d["target"])] = d
        for c in spec_candidates(ctx, spec):
            d = decided.get(c["target"])
            if d is None:
                res.fail(f"{describe(c)} looks like this requirement and nobody has decided whether it is. Record a disposition in {ORIGIN}: "
                         f"{', '.join(DECISIONS)}", rel if ctx.src.exists(rel) else f"specs/{spec}/spec.md")
                continue
            if d.get("decision") not in DECISIONS:
                res.fail(f"the disposition for {c['target']} must be one of {', '.join(DECISIONS)}", rel)
            if not str(d.get("reason") or "").strip():
                res.fail(f"the disposition for {c['target']} gives no reason", rel)
            problem = intake.decided_by_problem(ctx, d.get("decided_by"))
            if problem:
                res.fail(f"the disposition for {c['target']} {problem}", rel)
            if d.get("decision") in STOPPING:
                res.fail(f"{c['target']} was decided to be {d['decision']}; this spec should not go to its gate. Withdraw it, or fold what is new "
                         "into the other change", rel)
