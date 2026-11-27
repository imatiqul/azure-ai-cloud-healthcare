"""The system map: what exists, who owns it, and what depends on what (MAP-1 to MAP-7)."""
from __future__ import annotations

from dataclasses import dataclass, field

from agentic_kit.core import TIERS, Context, KitError

MAP_PATH = "system-map/map.yml"
NODE_TYPES = {
    "service", "frontend", "data-store", "schema", "schema-object", "api-contract", "event", "event-bus",
    "event-stream", "shared-library", "shared-package", "shared-ui", "shared-pipeline", "infrastructure",
    "external-application", "external-service", "identity-provider", "ai-component", "feature-flag", "secret-reference",
}
EDGE_TYPES = {"calls", "reads", "writes", "owns", "publishes", "subscribes", "builds-with", "deploys-with", "authenticates-via"}
DATA_TYPES = {"data-store", "schema", "schema-object"}
SHARED_TYPES = {"shared-library", "shared-package", "shared-ui", "shared-pipeline"}
CONTRACT_TYPES = {"api-contract", "event"}


@dataclass
class SystemMap:
    raw: dict
    nodes: dict[str, dict] = field(default_factory=dict)
    edges: list[dict] = field(default_factory=list)

    def consumers(self, node: str) -> list[tuple[str, str]]:
        """Nodes that depend directly on `node`, with the relation: every edge pointing at it."""
        return [(e["from"], e["rel"]) for e in self.edges if e.get("to") == node]

    def owned_by(self, node: str) -> list[str]:
        return [e["to"] for e in self.edges if e.get("from") == node and e.get("rel") == "owns"]

    def published_by(self, node: str) -> list[str]:
        return [e["to"] for e in self.edges if e.get("from") == node and e.get("rel") == "publishes"]

    def blast_radius(self, touched: list[str]) -> list[dict]:
        """Direct and transitive dependants of the touched nodes, nearest first (MAP-10)."""
        seen = {t: (0, "") for t in touched}
        frontier = list(touched)
        while frontier:
            current = frontier.pop(0)
            dist = seen[current][0]
            reached = [(other, f"{rel} {current}") for other, rel in self.consumers(current)]
            if dist == 0:
                # What a touched component owns or publishes is in play too: a change to a publisher can change
                # what every subscriber of its events receives.
                reached += [(o, f"is owned by {current}") for o in self.owned_by(current)]
                reached += [(t, f"is published by {current}") for t in self.published_by(current)]
            for other, via in reached:
                if other in self.nodes and other not in seen:
                    seen[other] = (dist + 1, via)
                    frontier.append(other)
        out = [{"node": n, "distance": d, "via": via, "owner": self.nodes[n].get("owner", "")}
               for n, (d, via) in seen.items() if d > 0]
        return sorted(out, key=lambda r: (r["distance"], r["node"]))

    def node_for(self, path: str) -> str | None:
        """The node a repository path belongs to, by the most specific index entry."""
        import fnmatch
        best, best_len = None, -1
        for entry in self.raw.get("index") or []:
            for glob in entry.get("paths") or []:
                if fnmatch.fnmatch(path, glob) and len(glob) > best_len:
                    best, best_len = entry.get("node"), len(glob)
        return best


def load_map(ctx: Context, required: bool = True) -> SystemMap | None:
    if not ctx.src.exists(MAP_PATH):
        if required:
            raise KitError(f"{MAP_PATH} is missing; run the map command to draft one")
        return None
    raw = ctx.src.yaml(MAP_PATH)
    if not isinstance(raw, dict):
        raise KitError(f"{MAP_PATH} must be a mapping")
    smap = SystemMap(raw)
    for n in raw.get("nodes") or []:
        if isinstance(n, dict) and n.get("id"):
            smap.nodes.setdefault(str(n["id"]), n)
    smap.edges = [e for e in (raw.get("edges") or []) if isinstance(e, dict)]
    return smap


def tier_rank(tier) -> int:
    return TIERS.index(tier) if tier in TIERS else -1


def restricted_classes(ctx: Context) -> set[str]:
    """Classification values that count as protected data: the first key of each active pack's vocabulary."""
    out = set()
    for _, body in ctx.packs():
        classes = list((body.get("classification") or {}).keys())
        if classes:
            out.add(classes[0])
    return out or {"restricted"}
