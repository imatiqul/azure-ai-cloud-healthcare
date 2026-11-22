# Privacy impact: 004-audit-identity

Draft, waiting at gate G3. Protected data touched: the nine services, through the audit record each of them writes.
Corrected on 2026-11-22 after the security review (`reviews/G5-security.md`, S-3) and the independent verification (`verification/G6-report.md`, V-7) found the first draft wrong about how a request arrives, where the identifier goes and who can read it. Each statement below was checked against the code at `8d04df3`, except where it says the review is its source.

## Purpose
To make the record of each access to patient data name the person who made it, so that a disclosure can be accounted for. No other use is added.

## Minimum fields
One field changes its content: the user identifier, which becomes the subject of the validated token. No field is added to the row or to the event. The path, which can contain a patient identifier, is recorded as it is today.
The application log changes too. The line `PHI_ACCESS` already carried a user, which was the same word for everyone; it now carries the identifier, beside the path. This change adds the identifier to `PHI_ACCESS_COMPLETE` and to the line written when the row cannot be saved, and adds one line, `PHI_ACCESS_NO_SUBJECT`, with the path and the correlation id. Whether log lines should carry the identifier at all is a decision for the owner (S-3, point 3); the change keeps what the code did before and names the logs here as a store.

## Lineage
A request reaches a service in one of three ways, and the record differs with each.
- Through the gateway's routes. The gateway authenticates the caller where it has an identity provider configured, and the service authenticates the token again.
- From the bff. It calls six services directly by name (pophealth-service, agent-service, revenue-service, scheduling-service, fhir-service, voice-service) and sends no token (`src/HealthQCopilot.BFF/Program.cs:11-39`). Such a request is recorded as `(unauthenticated)`, never as the person at the screen.
- From another service. By the review, calls between services (identity-service to fhir-service; fhir-service to identity-service and revenue-service) carry no user either.

"The service authenticates it" holds only where the service is given an identity provider. The settings files in the repository give none of the nine one; the deployment workflow sets it on each service when two repository variables are set, and otherwise leaves every request authenticated as one made-up user with every role (`.github/workflows/microservice-deploy.yml:447-477`; `JwtBearerExtensions.cs:26-34`). In that mode every record names `demo-user` (finding C1, spec 001).

The audit middleware writes to three places: one row in that service's own `phi_audit_logs` table; one event on the audit event stream (event-hubs-audit), or a log line in its place where the stream is not configured (`EventHubAuditService.cs:49-57`); and the log lines above, which are exported to the telemetry store when one is configured (`ObservabilityExtensions.cs:84-93`).

The identity-service reads its own table for the audit export and summary. Readers of the event stream and of the telemetry store are not in the repository and not on the system map, so this document cannot name them.

## Retention
Unchanged by this spec. The retention of audit records is not set anywhere in the repository; a comment says seven years and nothing enforces it. The retention of the log copies, which now hold the identifier, is not set either. Both are questions for the owner.

## Access paths
- The audit export and summary endpoints of the identity-service, guarded by the policy named PlatformAdmin. That policy also admits the Admin role (`JwtBearerExtensions.cs:46-47`). The export reads the identity-service's table only, with no tenant filter.
- The audit event stream.
- The telemetry store that receives the logs.
- Direct access to each service's database.
- `GET /api/v1/identity/users/by-external/{externalId}`, which has no guard and returns the display name and e-mail address for an identifier (`IdentityEndpoints.cs:49`).

## Who can see what
Holders of the PlatformAdmin or Admin role see the user identifier, method, path, status and time of each access the identity-service recorded, through the export. Anyone who can read the telemetry store sees the identifier beside the path for every service. For a patient reading their own record, the identifier is the patient's.
A user identifier is a subject from the identity provider. Inside the system it is one unguarded request away from a name and an e-mail address. Before this change the field held the same word for everyone, so this is the first time the export shows who accessed what; that is the purpose.
