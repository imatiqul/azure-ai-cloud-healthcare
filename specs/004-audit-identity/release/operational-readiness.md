# Operational readiness: 004-audit-identity

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository, branch `sdd/004-audit-identity` on `main` at `8d04df3`
- **Requirement IDs exercised:** QLT-20
- **Assumptions:** none
- **Unverified:** nothing here has been deployed. What exists in the repository was found by searching `infra/` and `docs/`; what a running environment has was not looked at

Draft for gate G7. Release is out of scope for the reference: G7 is "evidence prepared, decision pending".

## Service objectives touched
None. No objective for the audit trail is defined in the repository. The change adds no call to the request path (NFR-001): the identity is read from memory, and the row is written after the response, as before.

## Telemetry added
- `PHI_ACCESS_COMPLETE` now names the user of the record. The line for a row that could not be saved now names the user, the method, the path, the status and the correlation id, so the lost row can be rebuilt from it.
- One new line at warning level, `PHI_ACCESS_NO_SUBJECT`, when an authenticated request carries no subject.
- No metric is added. The values `(unauthenticated)` and `(no-subject)` in the `user_id` column and in the event are new; `anonymous` is no longer written.

## Alerts
None is added by this change, and none of the alert rules in `infra/` reads the audit table or these log lines. The rollout's five halt signals (`rollout.yml`) are written as conditions for a person to watch; nobody has turned them into alert rules. Three of them need one before the canary stage: a row whose user is `demo-user`, a rise in "Failed to persist PHI audit log entry", and a service that writes no row while it serves audited paths.

## Dashboards
None is added. `GET /api/v1/admin/audit/summary` groups by user and method and returns the 100 largest groups without saying that it stopped there; with real users it is no longer the whole picture (spec 007).

## Runbook changes
None is made. A reader of the trail needs four things written down that are not yet: the three values that are not people (`anonymous` in rows from before the release, `(unauthenticated)`, `(no-subject)`) and `demo-user`; the time each service changed over, since rows before it say `anonymous` and stay so; that the export covers the identity service's table only; and how a recorded identifier is resolved to a person, which is not settled (see `amendment-proposed.md`, item 5). `docs/compliance/FedRAMP-Authorization-Boundary.md:85` lists the user in the audit record as implemented; before this change that field held the same word for everyone.
