# Proposal: the adoption baseline

- **Phase and date:** Phase 9, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository at `8d04df3`
- **Requirement IDs exercised:** GOV-15, GOV-16, GOV-21
- **Assumptions:** the owners and the one expiry date below are proposed by an agent. Each is the owner's to change
- **Unverified:** nothing is waived by this document. The kit reads a baseline only from `.specify/agentic/waivers/baseline.yml`, and that file does not exist

## What this is

The kit found 635 things in this repository that it treats as a suppression or as an unanswered question in the system map. A check that fails on all of them at once tells nobody anything. An adoption baseline accepts a counted number of each kind as existing on the day the kit was adopted, gives each kind an owner and a date, and from then on the check fails only when the number rises or the date passes. It does not say any of them is acceptable.

Counted on 2026-11-22 with `agentic.py suppressions` over this repository at `8d04df3`.

| Kind | Count | Where | Removed by | Proposed owner |
|---|---|---|---|---|
| `ci-escape`: a pipeline step that cannot fail the run | 40 | `.github/workflows/` | Spec 014 (finding H6) | devops-sre |
| `test-skip`: a test that is skipped | 191 | `frontend/e2e/` (158), `frontend/e2e-cloud/` (33) | Spec 019 (finding M3) | qa |
| `advisory-suppress`: a security advisory that is silenced | 5 | `Directory.Build.props` | Spec 021 (finding M5) | security-compliance |
| `migration-warning-suppress`: a migration warning that is ignored | 1 | `src/HealthQCopilot.Infrastructure/` | Spec 013 (finding H5) | data-owner |
| `lint-disable`: a lint rule switched off in the code | 46 | `frontend/` (18), nine projects under `src/` (28) | No spec yet | engineering-manager |
| `pin-action`: a workflow action not pinned to a commit | 200 | `.github/workflows/` | No spec yet. Principle P-17 | devops-sre |
| `pin-digest`: an image with a version and no digest | 26 | Container files (22), a Helm template (1), the development host (3) | Spec 024 for the development host (finding N8); no spec yet for the rest | devops-sre |
| `pin-image`: an image with a floating tag | 13 | `infra/argocd/` (10), `infra/helm/` (1), the development host (2) | Spec 024 for the development host; no spec yet for the rest | devops-sre |
| `unversioned-contract`: a contract with no version | 36 | `system-map/map.yml`: 35 event topics, 1 API contract | Spec 025 (finding N9) | solutions-architect |
| `contract-drift-undeclared`: nothing says how drift from the code is detected | 36 | `system-map/map.yml` | Spec 025 | solutions-architect |
| `contract-untested`: a consumer with no contract test | 15 | `system-map/map.yml` | Spec 025 | qa |
| `unversioned-shared`: a shared component with no version | 12 | `system-map/map.yml` | No spec yet | platform |
| `external-dep-incomplete`: an external system with no timeout, fallback or owner recorded | 10 | `system-map/map.yml` | No spec yet | solutions-architect |
| `store-engine-unknown`: a data store whose engine and version the map does not state | 4 | `system-map/map.yml` | Spec 013 measures them | data-owner |

Three kinds are the showcase the reference names: `ci-escape` (H6), `test-skip` (M3) and `advisory-suppress` (M5). Each has a spec that removes it, so its group in the baseline falls to zero when that spec is done; the kit then says the group can be lowered.

Five kinds have no spec. A baseline group with an owner and a date is the least that should exist for them; a spec for each is the owner's call.

## What approving it takes

1. Decide the owner and the date of each group. One date is proposed for all: 2027-03-31.
2. Approve this proposal in a pull-request review. That review is the approval the baseline cites.
3. Add the file below as `.specify/agentic/waivers/baseline.yml`, with your GitHub name and that review in `approved_by`.

The kit refuses a baseline with no approval, a group with no owner or date, and a group whose date has passed.

```yaml
schema: agentic-baseline/1
approved_by:
  reviewer: ''        # the person who approved, as in roles.yml
  review_ref: ''      # pull/<number>#review-<id>
groups:
  - {rule: ci-escape, count: 40, owner: devops-sre, reason: Existing at adoption. Removed by spec 014, expires: 2027-03-31}
  - {rule: test-skip, count: 191, owner: qa, reason: Existing at adoption. Removed by spec 019, expires: 2027-03-31}
  - {rule: advisory-suppress, count: 5, owner: security-compliance, reason: Existing at adoption. Removed by spec 021, expires: 2027-03-31}
  - {rule: migration-warning-suppress, count: 1, owner: data-owner, reason: Existing at adoption. Removed by spec 013, expires: 2027-03-31}
  - {rule: lint-disable, count: 46, owner: engineering-manager, reason: Existing at adoption. No spec yet, expires: 2027-03-31}
  - {rule: pin-action, count: 200, owner: devops-sre, reason: Existing at adoption. No spec yet, expires: 2027-03-31}
  - {rule: pin-digest, count: 26, owner: devops-sre, reason: Existing at adoption. Spec 024 removes 3; no spec yet for 23, expires: 2027-03-31}
  - {rule: pin-image, count: 13, owner: devops-sre, reason: Existing at adoption. Spec 024 removes 2; no spec yet for 11, expires: 2027-03-31}
  - {rule: unversioned-contract, count: 36, owner: solutions-architect, reason: Existing at adoption. Removed by spec 025, expires: 2027-03-31}
  - {rule: contract-drift-undeclared, count: 36, owner: solutions-architect, reason: Existing at adoption. Removed by spec 025, expires: 2027-03-31}
  - {rule: contract-untested, count: 15, owner: qa, reason: Existing at adoption. Removed by spec 025, expires: 2027-03-31}
  - {rule: unversioned-shared, count: 12, owner: platform, reason: Existing at adoption. No spec yet, expires: 2027-03-31}
  - {rule: external-dep-incomplete, count: 10, owner: solutions-architect, reason: Existing at adoption. No spec yet, expires: 2027-03-31}
  - {rule: store-engine-unknown, count: 4, owner: data-owner, reason: Existing at adoption. Measured by spec 013, expires: 2027-03-31}
```
