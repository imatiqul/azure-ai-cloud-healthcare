## Summary

Describe what changed and why.

## Scope

- Affected areas:
- Risk level: low / medium / high
- Rollback approach:

## Contract Impact

- API route ownership changed: yes / no
- If yes, affected route prefixes:
- If yes, updated route map: `docs/stakeholders/api-route-ownership-map.md`

## Validation Evidence

- [ ] PR validation passed (`pr-validation.yml`)
- [ ] Workflow lint passed (`workflow-lint.yml`) when workflow files changed
- [ ] Helm chart validation passed (`helm-chart-validation.yml`) when `infra/helm` changed
- [ ] Runtime-impacting changes have cloud validation evidence (`cloud-e2e-tests.yml` or equivalent)

## Change Checklist

- [ ] Contract impact reviewed and documented
- [ ] Stakeholder documentation updated where applicable
- [ ] No hardcoded secrets or credentials introduced
- [ ] Logging/health-check behavior remains intact for changed services
