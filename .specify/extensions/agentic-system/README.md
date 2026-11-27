# agentic-system (slice 0.2 — system map, impact and change packs)

Adds a system map, discovery, impact analysis, change packs and 28 checks to the `agentic` extension.
Requires `agentic` to be installed first. Active on the Standard and Regulated profiles.

```bash
A="python .specify/extensions/agentic/scripts/agentic.py"
specify extension add --dev path/to/agentic-spec-kit/extensions/agentic-system
$A map discover --write            # drafts system-map/map.draft.yml
$A map validate
$A impact --spec <spec> --write    # blast radius, tier, required approvers, packs triggered
$A change plan --spec <spec> --write   # skeleton data-change plan and rollout order
$A change classify --spec <spec>       # how risky each migration is, and why
$A contract diff --node <contract> --base-ref origin/main
$A change check
```

## A programme seen from its parent

Added on 2026-11-26. For a spec whose front matter has `programme`, the page of the change (`$A changeset --spec <parent>`) gains a section that says where each child stands: for a child in this repository its title, tier, open gate and pull requests; for a child in another repository, named as `owner/name` and pinned to a commit, the tier and the gate decisions that commit holds, and whether the pin is behind. Only fixed words are copied from another repository, never a title or a name. A child's page names its parent and its place in the rollout order. It is a view: no gate waits for it, and `CK-PROGRAMME` is unchanged. `docs/design/programme-view.md` in the kit's repository has the rest.

## Change packs

| When a spec touches | It needs | Checked by |
|---|---|---|
| A data store | `data-change-plan.md` with the engine's headings; a classification no lower than what the migrations do; a CI run on the production engine and major version | `CK-DATA-PLAN`, `CK-DATA-CLASS`, `CK-MIGRATION-ENGINE`, `CK-MIGRATION-DRIFT`, `CK-SHARED-STORE`, `CK-SYNTH-DATA` |
| A contract | A new version; breaking changes declared under `breaking:`; each consumer's contract test run against the new contract | `CK-CONTRACT-VERSION`, `CK-CONTRACT-BREAK`, `CK-CONTRACT-CONSUMER`, `CK-DEPRECATION`, `CK-CONTRACT-DRIFT` |
| A shared component | A version change that fits `changes: {node: fix \| feature \| breaking}`; every consumer built and tested against it | `CK-SHARED-SEMVER`, `CK-CONSUMER-MATRIX` |
| An external service | A complete dependency record; the status of a legal agreement where the domain pack asks for one | `CK-EXTERNAL-DEP` |
| More than one deployable node | `rollout.yml`: deploy order, rollback order, flags, compatibility window | `CK-ROLLOUT` |
| Anything, at release | A CycloneDX bill of materials with allowed licences; pinned actions, images and packages | `CK-SBOM`, `CK-PIN` |

## Evidence is bound to what it was run against

CI records a run with `run contract`, `run build` or `run migration`. Each record carries a hash of the
contract file, the component's files or the migration files. Change the file afterwards and the record no
longer counts. The record says a run happened; it does not prove who wrote it. Until CI attestation
arrives (slice 0.4), protect `specs/*/evidence/` with code owners.

## Rules an existing codebase will not meet on day one

Unpinned references, migrations written for another engine, contracts and shared components with no
version, consumers with no contract test, and incomplete external-dependency records are reported under a
rule id. `suppressions --baseline` counts them per rule; an approved baseline carries them, and each count
may only go down (GOV-21). A new one needs its own waiver.

## Limits

- Engine adapters: PostgreSQL (SQL and EF Core migrations) and Qdrant (declared changes, plus destructive calls found in code). Other engines get the right headings and a note; their classification is taken as written. See `docs/adapters/engine.md`.
- Contract adapters: OpenAPI and GraphQL. A changed contract in any other format is reported as "not run", never as passed. See `docs/adapters/contract-format.md`.
- Discovery adapters: .NET projects, Node workspaces, Docker Compose, .NET Aspire app hosts and contract files. Events, external services and AI components are entered by hand as `assumed`.
- Nothing here connects to a database, a registry or any other service.
