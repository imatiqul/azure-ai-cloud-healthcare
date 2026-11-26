"""Plain, repeatable text comparison (INT-5). No model and no network: the same input always gives the same score.

It finds requirements that share vocabulary. It does not understand meaning, so two requirements that say the
same thing in different words score low; an agent or a person can add those candidates by hand.
"""
from __future__ import annotations

import math
import re
from collections import Counter

STOP = frozenset("""a an the and or of to in on for with by is are be been was were as at from that this these those it its into than then
when while where if given so not no can will would should could may might must shall have has had do does did their there which who whom what
how all any each every other such only also more most some per via about over under between within without after before during system user
users able allow allows allowed provide provides support supports need needs want wants like use uses using used""".split())
_WORD = re.compile(r"[a-z0-9]+")
_MARKUP = re.compile(r"`[^`]*`|<[^>]+>|\[[^\]]*\]\([^)]*\)|[*_#>|]")


def stem(word: str) -> str:
    """A light stemmer: enough to match 'exports', 'exported' and 'exporting'. Not a linguistic stemmer."""
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("ing") and len(word) > 6:
        return word[:-3]
    if word.endswith("ed") and len(word) > 4 and word[-3] != "e":
        return word[:-2]
    if word.endswith("es") and len(word) > 4 and (word[-3] in "sxz" or word[-4:-2] in ("ch", "sh")):
        return word[:-2]
    if word.endswith("s") and len(word) > 3 and word[-2:] not in ("ss", "us", "is"):
        return word[:-1]
    return word


def canonical(text: str, synonyms: dict[str, str] | None = None) -> str:
    """Lower-cased text with markup dropped and each avoided synonym replaced by the agreed term."""
    out = _MARKUP.sub(" ", text.lower())
    for phrase, term in sorted((synonyms or {}).items(), key=lambda kv: -len(kv[0])):
        out = re.sub(rf"\b{re.escape(phrase)}\b", term, out)
    return out


def words(text: str, synonyms: dict[str, str] | None = None) -> list[str]:
    return [stem(w) for w in _WORD.findall(canonical(text, synonyms)) if w not in STOP and len(w) > 1]


def features(text: str, synonyms: dict[str, str] | None = None) -> Counter:
    """The words of a text, counted. Single words only: pairs make short requirements look less alike than they are."""
    return Counter(words(text, synonyms))


def idf(documents: list[Counter]) -> dict[str, float]:
    n = len(documents)
    df = Counter(term for doc in documents for term in doc)
    return {term: math.log((n + 1) / (count + 1)) + 1.0 for term, count in df.items()}


def cosine(a: Counter, b: Counter, weights: dict[str, float]) -> tuple[float, list[str]]:
    """Similarity from 0 to 1, and the shared terms that contribute most to it."""
    def w(doc: Counter) -> dict[str, float]:
        return {t: (1 + math.log(c)) * weights.get(t, 1.0) for t, c in doc.items()}
    wa, wb = w(a), w(b)
    shared = sorted(set(wa) & set(wb))   # sorted, so that neither the sum nor the list depends on the order a set gives
    dot = sum(wa[t] * wb[t] for t in shared)
    norm = math.sqrt(sum(v * v for v in wa.values())) * math.sqrt(sum(v * v for v in wb.values()))
    top = sorted(shared, key=lambda t: (-(wa[t] * wb[t]), t))
    return (dot / norm if norm else 0.0), top[:5]


def jaccard(a: str, b: str, synonyms: dict[str, str] | None = None) -> float:
    sa, sb = set(words(a, synonyms)), set(words(b, synonyms))
    return len(sa & sb) / len(sa | sb) if sa and sb else 0.0
