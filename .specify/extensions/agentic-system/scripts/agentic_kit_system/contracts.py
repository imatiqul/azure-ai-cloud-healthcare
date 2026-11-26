"""Contract-format adapters (CHG-6 to CHG-9, ADP-8): OpenAPI and GraphQL.

Each adapter reads a contract file and answers: its version, what changed in a way that breaks
consumers, what is deprecated, and its surface (for comparing against a copy generated from code).
The comparisons are deliberately conservative subsets; what each one detects is listed in
docs/adapters/contract-format.md. Adding a format: same document.
"""
from __future__ import annotations

import json
import re

import yaml

from agentic_kit.core import KitError

METHODS = ("get", "put", "post", "delete", "patch", "options", "head", "trace")


class OpenAPI:
    id = "openapi"

    @staticmethod
    def matches(path: str, text: str) -> bool:
        return path.lower().endswith((".yaml", ".yml", ".json")) and bool(re.search(r'^\s*["\']?(openapi|swagger)["\']?\s*:', text, re.M))

    @staticmethod
    def load(text: str) -> dict:
        try:
            doc = json.loads(text) if text.lstrip().startswith("{") else yaml.safe_load(text)
        except (ValueError, yaml.YAMLError) as exc:
            raise KitError(f"the contract is not valid YAML or JSON: {exc}") from exc
        if not isinstance(doc, dict):
            raise KitError("the contract is not a mapping")
        return doc

    def normal(self, text: str):
        return self.load(text)

    def version(self, text: str) -> str:
        return str((self.load(text).get("info") or {}).get("version") or "")

    def surface(self, text: str) -> set[str]:
        doc = self.load(text)
        return {f"{m.upper()} {p}" for p, item in (doc.get("paths") or {}).items() if isinstance(item, dict)
                for m in METHODS if m in item}

    def deprecated(self, text: str) -> list[dict]:
        doc = self.load(text)
        out = []

        def add(element: str, obj: dict) -> None:
            if isinstance(obj, dict) and obj.get("deprecated") is True:
                out.append({"element": element, "sunset": obj.get("x-sunset"), "migration": obj.get("x-migration")})

        for p, item in (doc.get("paths") or {}).items():
            if not isinstance(item, dict):
                continue
            for m in METHODS:
                op = item.get(m)
                if not isinstance(op, dict):
                    continue
                add(f"{m.upper()} {p}", op)
                for prm in op.get("parameters") or []:
                    prm = _resolve(doc, prm)
                    add(f"{m.upper()} {p} parameter {prm.get('name')}", prm)
        schemas = ((doc.get("components") or {}).get("schemas")) or doc.get("definitions") or {}
        for name, schema in schemas.items():
            add(name, schema)
            for prop, body in ((schema or {}).get("properties") or {}).items():
                add(f"{name}.{prop}", body)
        return out

    def breaking(self, old_text: str, new_text: str) -> list[str]:
        old, new = self.load(old_text), self.load(new_text)
        out: list[str] = []
        for p, item in (old.get("paths") or {}).items():
            if not isinstance(item, dict):
                continue
            new_item = (new.get("paths") or {}).get(p)
            if not isinstance(new_item, dict):
                out.append(f"path removed: {p}")
                continue
            for m in METHODS:
                if m not in item:
                    continue
                where = f"{m.upper()} {p}"
                if m not in new_item:
                    out.append(f"operation removed: {where}")
                    continue
                self._operation(old, new, item[m] or {}, new_item[m] or {}, item, new_item, where, out)
        return out

    def _operation(self, old, new, a, b, a_item, b_item, where, out) -> None:
        def params(doc, op, item):
            rows = [_resolve(doc, x) for x in (item.get("parameters") or []) + (op.get("parameters") or [])]
            return {(x.get("name"), x.get("in")): x for x in rows if isinstance(x, dict)}

        pa, pb = params(old, a, a_item), params(new, b, b_item)
        for key, prm in pb.items():
            if prm.get("required") and not (pa.get(key) or {}).get("required"):
                out.append(f"{where}: parameter {key[0]} is now required")
        for key, prm in pa.items():
            if key in pb:
                ta, tb = _type(old, prm.get("schema") or prm), _type(new, pb[key].get("schema") or pb[key])
                if ta and tb and ta != tb:
                    out.append(f"{where}: parameter {key[0]} changed type from {ta} to {tb}")
        ra, rb = _resolve(old, a.get("requestBody") or {}), _resolve(new, b.get("requestBody") or {})
        if rb.get("required") and not ra.get("required") and (a.get("requestBody") is not None or rb.get("content")):
            out.append(f"{where}: the request body is now required")
        for ctype, media in (ra.get("content") or {}).items():
            other = (rb.get("content") or {}).get(ctype)
            if other is None:
                if rb.get("content"):
                    out.append(f"{where}: request content type {ctype} is no longer accepted")
                continue
            _schema(old, new, (media or {}).get("schema"), (other or {}).get("schema"), f"{where} request", "in", out, 0)
        for status, resp in (a.get("responses") or {}).items():
            other = (b.get("responses") or {}).get(status)
            if other is None:
                out.append(f"{where}: response {status} removed")
                continue
            resp, other = _resolve(old, resp), _resolve(new, other)
            ca, cb = resp.get("content"), other.get("content")
            if ca is None and "schema" in resp:  # Swagger 2
                ca, cb = {"*": {"schema": resp.get("schema")}}, {"*": {"schema": other.get("schema")}}
            for ctype, media in (ca or {}).items():
                o = (cb or {}).get(ctype)
                if o is None:
                    out.append(f"{where}: response {status} no longer returns {ctype}")
                    continue
                _schema(old, new, (media or {}).get("schema"), (o or {}).get("schema"), f"{where} response {status}", "out", out, 0)


def _resolve(doc: dict, obj, seen: tuple = ()):
    while isinstance(obj, dict) and isinstance(obj.get("$ref"), str) and obj["$ref"].startswith("#/"):
        ref = obj["$ref"]
        if ref in seen:
            return {}
        seen += (ref,)
        cur = doc
        for part in ref[2:].split("/"):
            cur = cur.get(part.replace("~1", "/").replace("~0", "~")) if isinstance(cur, dict) else None
        obj = cur
    return obj if isinstance(obj, dict) else {}


def _type(doc: dict, schema) -> str:
    s = _resolve(doc, schema)
    t = s.get("type")
    if isinstance(t, list):
        t = "|".join(sorted(str(x) for x in t if x != "null"))
    if t == "array":
        return f"array<{_type(doc, s.get('items'))}>"
    return f"{t}:{s['format']}" if t and s.get("format") else (t or "")


def _schema(old, new, a, b, where, direction, out, depth) -> None:
    """Compare two schemas. direction 'in' = what a client sends; 'out' = what a client receives."""
    if depth > 12:
        return
    a, b = _resolve(old, a), _resolve(new, b)
    if not a or not b:
        return
    ta, tb = _type(old, a), _type(new, b)
    if ta and tb and ta != tb:
        out.append(f"{where}: type changed from {ta} to {tb}")
        return
    ea, eb = a.get("enum"), b.get("enum")
    if isinstance(ea, list) and isinstance(eb, list) and direction == "in":
        for gone in [v for v in ea if v not in eb]:
            out.append(f"{where}: value {gone!r} is no longer accepted")
    pa, pb = a.get("properties") or {}, b.get("properties") or {}
    req_a, req_b = set(a.get("required") or []), set(b.get("required") or [])
    if direction == "in":
        for name in sorted(req_b - req_a):
            out.append(f"{where}: property {name} is now required")
    else:
        for name in sorted(set(pa) - set(pb)):
            out.append(f"{where}: property {name} removed")
        for name in sorted((req_a - req_b) & set(pb)):
            out.append(f"{where}: property {name} is no longer guaranteed")
    for name in sorted(set(pa) & set(pb)):
        _schema(old, new, pa[name], pb[name], f"{where}.{name}", direction, out, depth + 1)
    if a.get("items") and b.get("items"):
        _schema(old, new, a["items"], b["items"], f"{where}[]", direction, out, depth + 1)


class GraphQL:
    id = "graphql"

    @staticmethod
    def matches(path: str, text: str) -> bool:
        return path.lower().endswith((".graphql", ".graphqls", ".gql"))

    @staticmethod
    def _clean(text: str) -> str:
        text = re.sub(r'"""[\s\S]*?"""', "", text)
        text = re.sub(r'^\s*"[^"\n]*"\s*$', "", text, flags=re.M)
        return re.sub(r"(?m)#[^\n]*$", "", text)

    def parse(self, text: str) -> dict:
        """{type name: {"kind", "fields": {name: {"type", "args": {name: (type, has_default)}, "deprecated", "reason"}}}}"""
        types: dict[str, dict] = {}
        body = self._clean(text)
        for m in re.finditer(r"\b(?:extend\s+)?(type|input|interface|enum)\s+(\w+)[^{}]*\{([^{}]*)\}", body):
            kind, name, inner = m.groups()
            entry = types.setdefault(name, {"kind": kind, "fields": {}})
            directives = r"((?:\s*@\w+(?:\([^)]*\))?)*)"

            def info_for(tail: str) -> dict:
                dep = re.search(r'@deprecated(?:\(\s*reason\s*:\s*"([^"]*)"\s*\))?', tail)
                return {"deprecated": bool(dep), "reason": (dep.group(1) if dep and dep.group(1) else ""), "args": {}}

            if kind == "enum":
                for f in re.finditer(r"(\w+)" + directives, inner):
                    entry["fields"][f.group(1)] = {**info_for(f.group(2)), "type": ""}
                continue
            for f in re.finditer(r"(\w+)\s*(?:\(([^)]*)\))?\s*:\s*([\[\]\w!]+)(\s*=\s*[^\s@]+)?" + directives, inner):
                info = info_for(f.group(5))
                for arg in re.finditer(r"(\w+)\s*:\s*([\[\]\w!]+)(\s*=\s*[^,)\s]+)?", f.group(2) or ""):
                    info["args"][arg.group(1)] = (arg.group(2), bool(arg.group(3)))
                entry["fields"][f.group(1)] = {**info, "type": f.group(3), "default": bool(f.group(4))}
        return types

    def normal(self, text: str):
        return self.parse(text)

    def version(self, text: str) -> str:
        m = re.search(r"(?mi)^\s*#\s*version\s*:\s*(\S+)", text)
        return m.group(1) if m else ""

    def surface(self, text: str) -> set[str]:
        return {f"{t}.{f}" for t, body in self.parse(text).items() if body["kind"] in ("type", "interface") for f in body["fields"]}

    def deprecated(self, text: str) -> list[dict]:
        out = []
        for t, body in self.parse(text).items():
            for f, info in body["fields"].items():
                if info["deprecated"]:
                    date = re.search(r"\d{4}-\d{2}-\d{2}", info["reason"])
                    rest = re.sub(r"\d{4}-\d{2}-\d{2}", "", info["reason"]).strip(" .;,:-")
                    out.append({"element": f"{t}.{f}", "sunset": date.group(0) if date else None,
                                "migration": rest if date and len(rest) > 3 else None})
        return out

    def breaking(self, old_text: str, new_text: str) -> list[str]:
        old, new = self.parse(old_text), self.parse(new_text)
        out = []
        for t, body in old.items():
            if t not in new:
                out.append(f"type removed: {t}")
                continue
            nb = new[t]
            for f, info in body["fields"].items():
                if f not in nb["fields"]:
                    out.append(f"{'value' if body['kind'] == 'enum' else 'field'} removed: {t}.{f}")
                    continue
                other = nb["fields"][f]
                if body["kind"] == "enum":
                    continue
                a, b = info["type"], other["type"]
                if a != b:
                    tolerated = (b == a + "!") if body["kind"] != "input" else (a == b + "!")
                    if not tolerated:
                        out.append(f"{t}.{f}: type changed from {a} to {b}")
                for arg, (atype, _) in info["args"].items():
                    if arg not in other["args"]:
                        out.append(f"{t}.{f}: argument {arg} removed")
                    elif other["args"][arg][0] != atype and atype != other["args"][arg][0] + "!":
                        out.append(f"{t}.{f}: argument {arg} changed type from {atype} to {other['args'][arg][0]}")
                for arg, (atype, has_default) in other["args"].items():
                    if arg not in info["args"] and atype.endswith("!") and not has_default:
                        out.append(f"{t}.{f}: new required argument {arg}")
            if body["kind"] == "input":
                for f, info in nb["fields"].items():
                    if f not in body["fields"] and info["type"].endswith("!") and not info.get("default"):
                        out.append(f"{t}: new required input field {f}")
        return out


ADAPTERS = [OpenAPI(), GraphQL()]


def adapter_for(path: str, text: str):
    for a in ADAPTERS:
        if a.matches(path, text):
            return a
    return None


# ── semantic versions (CHG-6, CHG-10) ───────────────────────────────────────────

def semver(value) -> tuple[int, int, int] | None:
    m = re.match(r"\s*v?(\d+)\.(\d+)(?:\.(\d+))?", str(value or ""))
    return (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)) if m else None


def bump(old, new) -> str:
    """'major', 'minor', 'patch', 'none', 'down' or 'unreadable'."""
    a, b = semver(old), semver(new)
    if a is None or b is None:
        return "unreadable"
    if b < a:
        return "down"
    if b == a:
        return "none"
    return "major" if b[0] > a[0] else ("minor" if b[1] > a[1] else "patch")


BUMPS = ["none", "patch", "minor", "major"]
KINDS = {"fix": "patch", "feature": "minor", "breaking": "major"}


def required_bump(kind: str, old) -> str:
    """Semantic versioning, including its 0.y.z rule: before 1.0.0 a breaking change needs a minor bump."""
    need = KINDS[kind]
    v = semver(old)
    if v and v[0] == 0:
        need = {"major": "minor", "minor": "patch"}.get(need, need)
    return need


def read_version(path: str, text: str) -> str:
    """The version a manifest declares, by file type."""
    name = path.rsplit("/", 1)[-1].lower()
    if name.endswith(".json"):
        try:
            return str(json.loads(text).get("version") or "")
        except ValueError:
            return ""
    for rx in (r"<(?:Package)?Version>\s*([^<\s]+)\s*</", r'(?m)^\s*version\s*[:=]\s*["\']?([\w.\-+]+)', r"(?m)^\s*v?(\d+\.\d+(?:\.\d+)?[\w.\-+]*)\s*$"):
        m = re.search(rx, text)
        if m:
            return m.group(1)
    return ""
