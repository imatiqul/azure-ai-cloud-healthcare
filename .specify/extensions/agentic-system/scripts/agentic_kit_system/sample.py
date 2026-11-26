"""Self-test material for the system extension: extends the core sample project and adds fixtures."""
from __future__ import annotations

from pathlib import Path

from agentic_kit import selftest
from agentic_kit.core import KIT_DIR, unix_line_ends

from . import checks_change as cc
from .checks_map import compute_impact, render_impact
from .mapmodel import MAP_PATH, load_map

SPEC = selftest.SPEC
MAP = """schema: agentic-map/1
nodes:
  - id: demo-app
    type: service
    owner: backend
    tier: high
    classification: internal
    origin: derived
    evidence: src/demo/greet.py
  - id: demo-client
    type: frontend
    owner: frontend
    tier: medium
    classification: none
    origin: assumed
  - {id: demo-db, type: data-store, engine: postgresql, engine_version: "16", owner: data-owner, tier: high,
     classification: internal, origin: assumed, migrations: ["db/migrations/*"]}
  - {id: demo-lib, type: shared-library, owner: platform, tier: medium, classification: none, origin: derived,
     evidence: libs/demo-lib/package.json, version_file: libs/demo-lib/package.json}
  - {id: contract-demo-openapi, type: api-contract, owner: solutions-architect, tier: high, classification: internal,
     origin: derived, evidence: contracts/demo-openapi.yaml, drift: {generated: contracts/generated/demo-openapi.yaml}}
  - id: demo-mail
    type: external-service
    owner: devops-sre
    tier: medium
    classification: internal
    origin: assumed
    dependency:
      contract: Vendor REST API, documented at the vendor's developer site
      version: "2024-10"
      auth: API key held in the secret store
      data: Recipient address and greeting text
      availability: 99.9% monthly, per the vendor's terms
      timeout: 5 seconds
      retry: Three attempts with backoff
      circuit_breaker: Opens after five failures in one minute
      user_failure: The greeting is shown; the email is queued and sent later
      test_double: tests/doubles/mail.py
edges:
  - {from: demo-client, rel: calls, to: demo-app, origin: assumed}
  - {from: demo-app, rel: writes, to: demo-db, origin: assumed}
  - {from: demo-app, rel: builds-with, to: demo-lib, origin: assumed}
  - {from: demo-app, rel: owns, to: contract-demo-openapi, origin: assumed}
  - {from: demo-client, rel: calls, to: contract-demo-openapi, origin: assumed, contract_test: tests/contract/demo-client.test.js}
  - {from: demo-app, rel: calls, to: demo-mail, origin: assumed}
index:
  - {paths: ["src/demo/*"], node: demo-app}
  - {paths: ["web/*"], node: demo-client}
  - {paths: ["db/migrations/*"], node: demo-db}
  - {paths: ["libs/demo-lib/*"], node: demo-lib}
  - {paths: ["contracts/*"], node: contract-demo-openapi}
"""
CONTRACT = "contracts/demo-openapi.yaml"
GENERATED = "contracts/generated/demo-openapi.yaml"
OPENAPI = """openapi: 3.0.3
info: {title: Demo, version: 1.1.0}
paths:
  /greeting:
    get:
      parameters:
        - {name: name, in: query, required: true, schema: {type: string}}
      responses:
        '200':
          description: The greeting
          content:
            application/json:
              schema: {$ref: '#/components/schemas/Greeting'}
  /hello:
    get:
      deprecated: true
      x-sunset: "2027-06-30"
      x-migration: Use GET /greeting
      responses:
        '200': {description: The old greeting}
components:
  schemas:
    Greeting:
      type: object
      required: [text]
      properties:
        text: {type: string}
        language: {type: string}
"""
#: The contract as it was before the sample's change: one version back, without the new optional field.
OPENAPI_BASE = OPENAPI.replace("version: 1.1.0", "version: 1.0.0").replace("        language: {type: string}\n", "")
LIB_MANIFEST = "libs/demo-lib/package.json"
MIGRATION = "db/migrations/001_init.sql"
DATA_PLAN = """---
stores: [demo-db]
classification: additive
migrations: [db/migrations/001_init.sql]
---
# Data-change plan: greetings table

## Classification
Additive: one new table, nothing existing changes.

## Forward migration
`db/migrations/001_init.sql` creates `greetings`.

## Rollback or roll-forward
Roll back by dropping the new table; nothing else reads it yet.

## Backfill
None: the table starts empty. No lock on existing tables.

## Compatibility during rollout
The previous version never reads `greetings`, so both versions run side by side.

## Index and query impact
One primary-key index on a new table. No existing query changes.

## Tenant isolation
Every row carries `tenant_id`; queries filter on it.

## Retention and deletion
Rows are deleted after 30 days by the existing cleanup job.

## Field classification and encryption
`name` is internal. No protected data. Encrypted at rest by the store.

## Readers and writers
Written by demo-app. No other reader.
"""
ROLLOUT = """schema: agentic-rollout/1
deploy: [demo-db, demo-app]
rollback: [demo-app, demo-db]
flags: []
compatibility_window: Both versions of demo-app run against the new schema for one release.
"""
SBOM = """{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "components": [
    {"type": "library", "name": "demo-lib", "version": "1.1.0", "licenses": [{"license": {"id": "MIT"}}]}
  ]
}
"""
#: What the change-versus-base checks are told about the sample's change.
BASE = {"changed_files": ["libs/demo-lib/index.js", LIB_MANIFEST, CONTRACT, f"specs/{SPEC}/spec.md"],
        "base_files": {CONTRACT: OPENAPI_BASE, LIB_MANIFEST: '{"name": "demo-lib", "version": "1.0.0"}\n'}}
FINDINGS = """findings:
  - id: F-001
    statement: The greeting does not escape the name
    evidence: [src/demo/greet.py]
"""
OTHER_SPEC = """---
spec: 002-other
tier_declared: high
owner_role: backend
principles: [P-1]
touches: [demo-app]
---
# Other

- **FR-001**: System MUST do something else to the same service.
"""


def extend_sample(root: Path) -> None:
    import hashlib

    import yaml
    w, e = selftest._write, selftest._edit
    w(root, MAP_PATH, MAP)
    w(root, f"{KIT_DIR}/findings.yml", FINDINGS)
    e(f"{KIT_DIR}/roles.yml", "  - solutions-architect\n",
      "  - solutions-architect\n  - backend\n  - frontend\n  - data-owner\n  - platform\n")(root)
    e(f"specs/{SPEC}/spec.md", 'paths: ["src/demo/*"]\n',
      'paths: ["src/demo/*"]\ntouches: [demo-app, demo-db, demo-lib, contract-demo-openapi]\nchanges: {demo-lib: feature}\n')(root)
    kit = root / KIT_DIR / "kit.yml"
    cfg = yaml.safe_load(kit.read_text(encoding="utf-8"))
    cfg["supply_chain"] = {"licences": {"deny": ["GPL-3.0-only", "AGPL-3.0-only"]}}
    kit.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8", newline="\n")
    # the things the change packs look at
    w(root, MIGRATION, "CREATE TABLE greetings (\n  id uuid PRIMARY KEY,\n  tenant_id uuid NOT NULL,\n  name text NOT NULL\n);\n")
    w(root, "db/seed/people.csv", "name,email,phone\nAda Example,ada@example.com,555-0100\n")
    w(root, CONTRACT, OPENAPI)
    w(root, GENERATED, OPENAPI)
    w(root, "tests/contract/demo-client.test.js", "// consumer contract test for demo-client against contract-demo-openapi\n")
    w(root, "tests/doubles/mail.py", "def send(to, text):\n    return {'queued': True}\n")
    w(root, LIB_MANIFEST, '{"name": "demo-lib", "version": "1.1.0"}\n')
    w(root, "libs/demo-lib/index.js", "exports.title = (s) => s.trim();\n")
    base = f"specs/{SPEC}"
    w(root, f"{base}/{cc.PLAN}", DATA_PLAN)
    w(root, f"{base}/{cc.ROLLOUT}", ROLLOUT)
    w(root, f"{base}/{cc.SBOM}", SBOM)
    ctx = selftest.context(root)
    smap = load_map(ctx)
    digest = hashlib.sha256(unix_line_ends((root / MIGRATION).read_bytes())).hexdigest()
    w(root, f"{base}/{cc.MIGRATION_RUN}",
      f'schema: agentic-migration-run/1\nstore: demo-db\nengine: postgresql\nengine_version: "16.4"\nresult: pass\n'
      f"model_drift: none\napplied:\n  - {{path: {MIGRATION}, sha256: {digest}}}\n")
    w(root, f"{base}/{cc.CONSUMER_RUNS}",
      "schema: agentic-runs/1\nruns:\n"
      f"  - {{kind: contract, provider: contract-demo-openapi, consumer: demo-client, result: pass, subject: '{cc.subject_hash(ctx, smap, 'contract-demo-openapi')}'}}\n"
      f"  - {{kind: build, provider: demo-lib, consumer: demo-app, result: pass, subject: '{cc.subject_hash(ctx, smap, 'demo-lib')}'}}\n")
    w(root, f"{base}/impact.md", render_impact(compute_impact(ctx, smap, SPEC), smap))


def _append(rel: str, text: str):
    def go(root: Path) -> None:
        p = root / rel
        p.write_text(p.read_text(encoding="utf-8") + text, encoding="utf-8", newline="\n")
    return go


SPECFILE = f"specs/{SPEC}/spec.md"
E = selftest._edit


def fixtures() -> dict:
    return {
        "CK-MAP-SCHEMA": ("an edge points at a node that does not exist", E(MAP_PATH, "to: demo-app", "to: ghost"), {}, {}),
        "CK-MAP-OWNER": ("a node has no owner", E(MAP_PATH, "    owner: frontend\n", ""), {}, {}),
        "CK-MAP-EVIDENCE": ("a derived node cites a file that was deleted", E(MAP_PATH, "evidence: src/demo/greet.py", "evidence: src/demo/gone.py"), {}, {}),
        "CK-MAP-DRIFT": ("a new package exists in the code but not in the map",
                         lambda root: selftest._write(root, "services/new/package.json", '{"name": "new-service", "scripts": {"start": "node ."}, "dependencies": {"express": "4"}}'), {}, {}),
        "CK-MAP-FEDERATION": ("a federated map is pinned to a branch name",
                              _append(MAP_PATH, "federated:\n  - {name: other, repo: example/other, ref: main, path: system-map}\n"), {}, {}),
        "CK-TOUCH": ("a change edits a node the spec does not declare", lambda root: None,
                     {"changed_files": ["src/demo/greet.py", SPECFILE]}, {"changed_files": ["web/app.js", SPECFILE]}),
        "CK-IMPACT": ("the map changed after the impact report was generated", E(MAP_PATH, "    owner: frontend\n", "    owner: platform\n"), {}, {}),
        "CK-TIER-RAISE": ("a spec declared high touches a critical node", E(MAP_PATH, "tier: high", "tier: critical"), {}, {}),
        "CK-CROSS-SPEC": ("two in-flight specs touch the same node with no order",
                          lambda root: [selftest._write(root, f"specs/{s}/spec.md", OTHER_SPEC.replace("002-other", s))
                                        for s in ("002-other", "003-another")] and None, {}, {}),
        "CK-PROGRAMME": ("a programme spec has no children or contract",
                         E(SPECFILE, "changes: {demo-lib: feature}\n", "changes: {demo-lib: feature}\nprogramme: {children: [], rollout: []}\n"), {}, {}),
        **change_fixtures(),
        "CK-FINDING-EVIDENCE": ("a finding cites a file that does not exist",
                                E(f"{KIT_DIR}/findings.yml", "evidence: [src/demo/greet.py]", "evidence: [src/demo/nowhere.py]"), {}, {}),
    }


def change_fixtures() -> dict:
    w = selftest._write
    plan, run = f"specs/{SPEC}/{cc.PLAN}", f"specs/{SPEC}/{cc.MIGRATION_RUN}"
    real_looking = "pat.roe@" + "contoso" + ".com"  # an invented address on a vendor's fictitious domain, assembled here
    return {
        "CK-DATA-PLAN": ("the data-change plan has no rollback section",
                         E(plan, "## Rollback or roll-forward\nRoll back by dropping the new table; nothing else reads it yet.\n", ""), {}, {}),
        "CK-DATA-CLASS": ("a migration drops a column but the plan says additive",
                          _append(MIGRATION, "ALTER TABLE visitors DROP COLUMN email;\n"), {}, {}),
        "CK-MIGRATION-ENGINE": ("migrations were applied on a different major version than production",
                                E(run, 'engine_version: "16.4"', 'engine_version: "14.9"'), {}, {}),
        "CK-MIGRATION-DRIFT": ("the pending-model-changes warning is suppressed",
                               lambda root: w(root, "src/demo/Db.cs", "options.ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning));\n"), {}, {}),
        "CK-SHARED-STORE": ("a second service writes the store and it is not flagged shared",
                            E(MAP_PATH, "index:\n", "  - {from: demo-client, rel: writes, to: demo-db, origin: assumed}\nindex:\n"), {}, {}),
        "CK-SYNTH-DATA": ("seed data holds an address on a real domain",
                          _append("db/seed/people.csv", f"Pat Roe,{real_looking},555-0101\n"), {}, {}),
        "CK-CONTRACT-VERSION": ("the contract changed and kept its version",
                                E(CONTRACT, "version: 1.1.0", "version: 1.0.0"), BASE, BASE),
        "CK-CONTRACT-BREAK": ("a response field was removed and no spec declares a breaking change",
                              E(CONTRACT, "        text: {type: string}\n", ""), BASE, BASE),
        "CK-CONTRACT-CONSUMER": ("the contract changed after the consumer's contract test ran",
                                 E(CONTRACT, "        language: {type: string}\n", "        language: {type: string}\n        tone: {type: string}\n"), BASE, BASE),
        "CK-DEPRECATION": ("a deprecated endpoint has no removal date", E(CONTRACT, '      x-sunset: "2027-06-30"\n', ""), {}, {}),
        "CK-CONTRACT-DRIFT": ("the code serves an endpoint the contract does not list", E(GENERATED, "  /hello:", "  /hi:"), {}, {}),
        "CK-SHARED-SEMVER": ("a breaking change shipped as a minor version",
                             E(SPECFILE, "changes: {demo-lib: feature}", "changes: {demo-lib: breaking}"), BASE, BASE),
        "CK-CONSUMER-MATRIX": ("the shared library changed after its consumer was built and tested",
                               _append("libs/demo-lib/index.js", "exports.upper = (s) => s.toUpperCase();\n"), BASE, BASE),
        "CK-EXTERNAL-DEP": ("an external service records no timeout", E(MAP_PATH, "      timeout: 5 seconds\n", ""), {}, {}),
        "CK-SBOM": ("a dependency carries a licence the policy denies", E(f"specs/{SPEC}/{cc.SBOM}", '"MIT"', '"AGPL-3.0-only"'), {}, {}),
        "CK-PIN": ("an image is tagged latest",
                   lambda root: w(root, "docker-compose.yml", "services:\n  db:\n    image: postgres:latest\n"), {}, {}),
        "CK-ROLLOUT": ("a service is deployed before the store it writes to is migrated",
                       E(f"specs/{SPEC}/{cc.ROLLOUT}", "deploy: [demo-db, demo-app]", "deploy: [demo-app, demo-db]"), {}, {}),
    }
