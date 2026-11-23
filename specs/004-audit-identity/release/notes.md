# Release notes: audit records name the authenticated user (004, finding C4)

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository, branch `sdd/004-audit-identity` on `main` at `8d04df3`
- **Requirement IDs exercised:** CHG-19, QLT-20
- **Assumptions:** none
- **Unverified:** nothing has been released. The solution was not built or tested; see `evidence/` for what was run instead

Draft for gate G7. Evidence prepared, decision pending.

## What changes
- In the nine services, a record of access to an audited path names the subject of the token the service validated. Before, every record said `anonymous`.
- A request with no authenticated caller is recorded as `(unauthenticated)`. An authenticated request whose token has no subject is recorded as `(no-subject)`, with a warning in the log.
- A request that a service refuses with 401 or 403 is recorded, with that status.
- The audit middleware runs directly after authentication and before authorization in all nine services. A test fails the build, naming the service, when that is not so.
- The event on the audit event stream names the same user as the row. The middleware's log lines name that user too.

## What does not change
- The shape of the record and of the `phi_audit_logs` table. No migration.
- Which paths are audited. The notification service serves none of them and writes no record.
- The write is still started and not awaited, and a failed write is only logged.
- Records written before the release still say `anonymous`.

## Before it is released
- Spec 001 is released and each service has an identity provider. Without one, every record names `demo-user`.
- A workflow runs the unit tests on pull requests. None has run since May 2026.
- The solution's own tests have run (task T005), and the independent verification has been repeated on them (task T006).

## What it does not close
Found by the two reviews of this change, and not fixed by it: a caller with no token is refused at the gateway, which writes no audit record; requests from the bff and between services carry no user; a request that ends in an exception leaves no record; the audited paths are not all the paths that hold patient data; how a recorded identifier is resolved to a person is not settled. Each is in `plan.md` under "Found while planning", with the spec it goes to or the note that none owns it.

## Missing for G7
- Gates G3 to G6 have no decision.
- A bill of materials: it needs the solution to build.
- The rollback rehearsal, the staging checks and the checks in production: they need an environment.
