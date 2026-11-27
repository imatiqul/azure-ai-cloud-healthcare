"""Data-engine adapters (CHG-1 to CHG-5, ADP-5, ADP-6).

An engine adapter answers three questions about a store, from files alone:
which headings its data-change plan needs, how risky a migration is, and whether a migration
was written for a different engine. Nothing here connects to a database.

Adding an engine: see docs/adapters/engine.md.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

#: Least to most dangerous (CHG-2).
RANK = ["additive", "backward-compatible", "breaking", "destructive"]

COMMON = ["Classification", "Rollback or roll-forward", "Compatibility during rollout", "Tenant isolation",
          "Retention and deletion", "Field classification and encryption", "Readers and writers"]
FAMILY_HEADINGS = {
    "relational": ["Forward migration", "Backfill", "Index and query impact"],
    "vector": ["Collection and vector changes", "Re-embedding plan", "Search index rebuild"],
    "document": ["Document shape versioning", "Index and partition-key changes"],
    "cache": ["Cache key and expiry changes"],
    "search": ["Search index rebuild"],
}
FAMILIES = {
    "postgresql": "relational", "mysql": "relational", "mariadb": "relational", "sqlserver": "relational",
    "sqlite": "relational", "qdrant": "vector", "mongodb": "document", "cosmosdb": "document", "redis": "cache",
    "elasticsearch": "search", "opensearch": "search",
}


def rank(cls: str | None) -> int:
    return RANK.index(cls) if cls in RANK else -1


def worst(found: list[tuple[str, str]]) -> tuple[str, str] | None:
    return max(found, key=lambda f: rank(f[0])) if found else None


@dataclass
class Engine:
    id: str
    family: str
    classify: Callable[[str, str], list[tuple[str, str]]] | None = None  # (path, text) -> [(class, reason)]
    foreign: Callable[[str, str], list[str]] | None = None               # (path, text) -> markers of another engine
    declared: dict[str, str] = field(default_factory=dict)               # declared change kind -> class

    @property
    def headings(self) -> list[str]:
        return COMMON + FAMILY_HEADINGS.get(self.family, [])


# ── SQL ─────────────────────────────────────────────────────────────────────────

def _statements(sql: str) -> list[str]:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    # Statements inside DO blocks and IF branches are classified like any other.
    sql = re.sub(r"\bDO\s+\$\w*\$|\$\w*\$|\bBEGIN\b|\bTHEN\b|\bELSE\b|\bEND IF\b|\bLOOP\b", ";", sql, flags=re.I)
    return [re.sub(r"\s+", " ", s).strip() for s in sql.split(";") if s.strip()]


def _split_top(text: str) -> list[str]:
    """Split on commas that are not inside parentheses."""
    out, depth, cur = [], 0, []
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur).strip())
    return [x for x in out if x]


_NAME = r'((?:"[^"]+"|[\w$]+)(?:\.(?:"[^"]+"|[\w$]+))?)'


def _norm(name: str) -> str:
    return name.replace('"', "").lower()


def classify_sql(path: str, text: str) -> list[tuple[str, str]]:
    """Classify each statement of a PostgreSQL migration. Unrecognised statements are reported, not guessed."""
    out: list[tuple[str, str]] = []
    created: set[str] = set()
    for st in _statements(text):
        u = st.upper()
        short = st[:70]
        m = re.match(rf"CREATE (?:UNLOGGED |TEMP(?:ORARY)? )?TABLE (?:IF NOT EXISTS )?{_NAME}", st, re.I)
        if m:
            created.add(_norm(m.group(1)))
            out.append(("additive", f"creates table {m.group(1)}"))
            continue
        m = re.match(rf"CREATE (UNIQUE )?INDEX (CONCURRENTLY )?(?:IF NOT EXISTS )?(?:{_NAME} )?ON (?:ONLY )?{_NAME}", st, re.I)
        if m:
            table = _norm(m.group(4))
            if table in created:
                out.append(("additive", f"index on a table this migration creates ({m.group(4)})"))
            elif m.group(1):
                out.append(("breaking", f"unique index on existing table {m.group(4)} rejects rows the previous version could write"))
            else:
                lock = "" if m.group(2) else "; without CONCURRENTLY it blocks writes while it builds"
                out.append(("backward-compatible", f"index on existing table {m.group(4)}{lock}"))
            continue
        if re.match(r"CREATE OR REPLACE ", u):
            out.append(("backward-compatible", f"replaces an existing object: {short}"))
            continue
        if re.match(r"CREATE (SCHEMA|TYPE|EXTENSION|SEQUENCE|VIEW|MATERIALIZED VIEW|FUNCTION|PROCEDURE|TRIGGER|POLICY|ROLE|DOMAIN)\b", u):
            out.append(("additive", f"creates an object: {short}"))
            continue
        m = re.match(r"DROP (TABLE|SCHEMA|DATABASE|SEQUENCE|MATERIALIZED VIEW)\b", u)
        if m:
            out.append(("destructive", f"drops a {m.group(1).lower()}: {short}"))
            continue
        if re.match(r"DROP (VIEW|FUNCTION|PROCEDURE|TYPE|TRIGGER|POLICY|DOMAIN)\b", u):
            out.append(("breaking", f"removes an object the previous version may use: {short}"))
            continue
        if re.match(r"DROP INDEX\b", u):
            out.append(("backward-compatible", f"drops an index; check query plans: {short}"))
            continue
        if re.match(r"TRUNCATE\b", u) or re.match(r"DELETE FROM\b", u):
            out.append(("destructive", f"removes rows: {short}"))
            continue
        if re.match(r"UPDATE\b", u):
            out.append(("backward-compatible", f"rewrites existing rows; plan it as a backfill: {short}"))
            continue
        if re.match(r"INSERT\b", u):
            out.append(("additive", f"adds rows: {short}"))
            continue
        m = re.match(rf"ALTER TABLE (?:IF EXISTS )?(?:ONLY )?{_NAME} (.*)", st, re.I | re.S)
        if m:
            table, fresh = m.group(1), _norm(m.group(1)) in created
            for action in _split_top(m.group(2)):
                a = action.upper()
                if re.match(r"DROP (COLUMN )?(IF EXISTS )?(?!CONSTRAINT\b)", a) and not a.startswith("DROP CONSTRAINT"):
                    out.append(("destructive", f"drops a column of {table}: {action[:50]}"))
                elif a.startswith("DROP CONSTRAINT"):
                    out.append(("backward-compatible", f"loosens {table}: {action[:50]}"))
                elif re.match(r"ADD (CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)\b", a):
                    if fresh:
                        out.append(("additive", f"constraint on a table this migration creates ({table})"))
                    elif "NOT VALID" in a:
                        out.append(("backward-compatible", f"constraint on {table} added NOT VALID; existing rows are not checked"))
                    else:
                        out.append(("breaking", f"new constraint on existing table {table}: {action[:50]}"))
                elif a.startswith("ADD"):
                    needs_value = "NOT NULL" in a and not re.search(r"\b(DEFAULT|GENERATED|SERIAL|BIGSERIAL|SMALLSERIAL)\b", a)
                    if fresh:
                        out.append(("additive", f"column on a table this migration creates ({table})"))
                    elif needs_value:
                        out.append(("breaking", f"required column with no default on existing table {table}: {action[:50]}"))
                    else:
                        out.append(("backward-compatible", f"optional or defaulted column on {table}: {action[:50]}"))
                elif a.startswith("RENAME"):
                    out.append(("breaking", f"rename on {table}: {action[:50]}"))
                elif re.match(r"ALTER (COLUMN )?\S+ (SET DATA )?TYPE\b", a):
                    out.append(("breaking", f"column type change on {table}: {action[:50]}"))
                elif re.match(r"ALTER (COLUMN )?\S+ SET NOT NULL", a):
                    out.append(("breaking", f"column made required on {table}: {action[:50]}"))
                elif re.match(r"ALTER (COLUMN )?\S+ DROP DEFAULT", a):
                    out.append(("breaking", f"default removed on {table}; writers that relied on it fail: {action[:50]}"))
                elif re.match(r"ALTER (COLUMN )?\S+ (DROP NOT NULL|SET DEFAULT)", a):
                    out.append(("backward-compatible", f"loosens {table}: {action[:50]}"))
                elif re.match(r"(ENABLE|DISABLE|FORCE|NO FORCE) ", a) or re.match(r"(OWNER TO|SET SCHEMA|SET \(|VALIDATE CONSTRAINT|ATTACH|DETACH)", a):
                    out.append(("backward-compatible", f"alters {table}: {action[:50]}"))
                else:
                    out.append(("unrecognised", f"ALTER TABLE {table} {action[:50]}"))
            continue
        if re.match(r"ALTER TYPE\b", u):
            out.append(("backward-compatible", f"adds an enum value: {short}") if " ADD VALUE" in u
                       else ("breaking", f"changes a type the previous version uses: {short}"))
            continue
        if re.match(r"ALTER (INDEX|SEQUENCE|VIEW|MATERIALIZED VIEW|SCHEMA|FUNCTION|POLICY|ROLE|DATABASE|DEFAULT PRIVILEGES|EXTENSION)\b", u):
            out.append(("breaking" if " RENAME " in u else "backward-compatible", f"alters an object: {short}"))
            continue
        if re.match(r"(BEGIN|COMMIT|START TRANSACTION|SET|RESET|GRANT|REVOKE|COMMENT|ANALYZE|VACUUM|LOCK|SELECT|DO|END|RETURN|IF|PERFORM|\$\$|LANGUAGE|REFRESH|REINDEX|CLUSTER|DECLARE|RAISE|EXCEPTION|ELSE|ELSIF|LOOP|FOR|WHILE)\b", u):
            continue
        out.append(("unrecognised", short))
    return out


_FOREIGN_SQL = [
    (r"\bAUTOINCREMENT\b", "SQLite AUTOINCREMENT"), (r"\bAUTO_INCREMENT\b", "MySQL AUTO_INCREMENT"),
    (r"\bN?VARCHAR\(MAX\)|\bNVARCHAR\b|\bDATETIME2\b|\bUNIQUEIDENTIFIER\b|\bIDENTITY\(\d+,\s*\d+\)", "SQL Server type"),
    (r"\bENGINE\s*=\s*\w+", "MySQL storage engine clause"), (r"`\w+`", "MySQL backtick quoting"),
]


def foreign_sql(path: str, text: str) -> list[str]:
    body = " ".join(_statements(text))
    return sorted({label for rx, label in _FOREIGN_SQL if re.search(rx, body, re.I)})


# ── EF Core migrations (the ORM the reference system uses) ──────────────────────

def _calls(body: str) -> list[tuple[str, str]]:
    """(operation, argument text) for each migrationBuilder call."""
    out = []
    for m in re.finditer(r"migrationBuilder\.(\w+)(?:<[^>(]*>)?\(", body):
        depth, i = 1, m.end()
        while i < len(body) and depth:
            depth += {"(": 1, ")": -1}.get(body[i], 0)
            i += 1
        out.append((m.group(1), body[m.end():i - 1]))
    return out


def _up(text: str) -> str:
    m = re.search(r"void\s+Up\s*\(", text)
    if not m:
        return ""
    end = re.search(r"void\s+Down\s*\(", text[m.end():])
    return text[m.end(): m.end() + end.start()] if end else text[m.end():]


def classify_efcore(path: str, text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    created: set[str] = set()
    for op, args in _calls(_up(text)):
        name = (re.search(r'name:\s*"([^"]+)"', args) or [None, "?"])[1]
        table = (re.search(r'table:\s*"([^"]+)"', args) or [None, name])[1]
        if op == "CreateTable":
            created.add(name)
            out.append(("additive", f"creates table {name}"))
        elif op in ("DropTable", "DropColumn", "DropSchema", "DropSequence"):
            out.append(("destructive", f"{op} {table if op != 'DropTable' else name}" + (f".{name}" if op == "DropColumn" else "")))
        elif op in ("RenameColumn", "RenameTable", "RenameIndex", "RenameSequence"):
            out.append(("breaking", f"{op} {name}"))
        elif op == "AlterColumn":
            out.append(("breaking", f"AlterColumn {table}.{name}: a type or nullability change the previous version may not tolerate"))
        elif op == "AddColumn":
            required = re.search(r"nullable:\s*false", args) and not re.search(r"defaultValue(Sql)?:", args)
            if table in created:
                out.append(("additive", f"column on a table this migration creates ({table})"))
            else:
                out.append(("breaking", f"required column with no default on existing table {table}.{name}") if required
                           else ("backward-compatible", f"optional or defaulted column {table}.{name}"))
        elif op in ("AddForeignKey", "AddUniqueConstraint", "AddCheckConstraint", "AddPrimaryKey"):
            out.append(("additive", f"constraint on a table this migration creates ({table})") if table in created
                       else ("breaking", f"{op} on existing table {table}"))
        elif op == "CreateIndex":
            if table in created:
                out.append(("additive", f"index on a table this migration creates ({table})"))
            elif re.search(r"unique:\s*true", args):
                out.append(("breaking", f"unique index on existing table {table}"))
            else:
                out.append(("backward-compatible", f"index on existing table {table}; EF Core builds it without CONCURRENTLY"))
        elif op in ("DropIndex", "DropForeignKey", "DropCheckConstraint", "DropUniqueConstraint", "DropPrimaryKey"):
            out.append(("backward-compatible", f"{op} on {table}"))
        elif op in ("EnsureSchema", "CreateSequence", "InsertData", "AlterDatabase"):
            out.append(("additive", f"{op} {name}"))
        elif op in ("UpdateData",):
            out.append(("backward-compatible", f"UpdateData on {table}; plan it as a backfill"))
        elif op == "DeleteData":
            out.append(("destructive", f"DeleteData on {table}"))
        elif op == "Sql":
            literal = re.match(r'\s*@?"((?:[^"\\]|\\.|"")*)"', args, re.S)
            if literal:
                out += classify_sql(path, literal.group(1).replace('""', '"'))
            else:
                out.append(("unrecognised", "raw SQL built at run time"))
        else:
            out.append(("unrecognised", f"{op} {name}"))
    return out


_FOREIGN_EF = [
    (r'"Sqlite:', "SQLite annotation"), (r'"SqlServer:', "SQL Server annotation"), (r'"MySql:', "MySQL annotation"),
    (r'type:\s*"(TEXT|INTEGER|REAL|BLOB)"', "SQLite column type"), (r'type:\s*"(nvarchar|datetime2|uniqueidentifier|bit)', "SQL Server column type"),
]


def foreign_efcore(path: str, text: str) -> list[str]:
    return sorted({label for rx, label in _FOREIGN_EF if re.search(rx, text)})


def _by_file(sql, cs):
    def go(path: str, text: str):
        if path.endswith(".sql"):
            return sql(path, text)
        if path.endswith(".cs"):
            return cs(path, text)
        return []
    return go


# ── vector stores: changes are declared in the plan, with two calls detected in code ────────────

QDRANT_DECLARED = {
    "create-collection": "additive", "add-payload-index": "backward-compatible", "add-payload-field": "backward-compatible",
    "drop-payload-index": "backward-compatible", "change-vector-size": "breaking", "change-distance": "breaking",
    "change-embedding-model": "breaking", "rename-collection": "breaking", "delete-points": "destructive",
    "delete-collection": "destructive", "recreate-collection": "destructive",
}


def classify_qdrant(path: str, text: str) -> list[tuple[str, str]]:
    out = []
    for m in re.finditer(r"\b(recreate_collection|RecreateCollection\w*|delete_collection|DeleteCollection\w*)\s*\(", text):
        out.append(("destructive", f"{m.group(1)} discards every vector in the collection"))
    return out


ENGINES: dict[str, Engine] = {
    "postgresql": Engine("postgresql", "relational", _by_file(classify_sql, classify_efcore), _by_file(foreign_sql, foreign_efcore)),
    "qdrant": Engine("qdrant", "vector", classify_qdrant, None, QDRANT_DECLARED),
}


def engine_for(engine_id: str | None) -> Engine:
    """The adapter for an engine, or a headings-only stand-in for one the kit has no adapter for."""
    eid = str(engine_id or "").lower()
    return ENGINES.get(eid) or Engine(eid or "unknown", FAMILIES.get(eid, "relational" if not eid else "other"))


def has_adapter(engine_id: str | None) -> bool:
    return str(engine_id or "").lower() in ENGINES


def major(version) -> str:
    m = re.match(r"\s*v?(\d+)", str(version or ""))
    return m.group(1) if m else ""
