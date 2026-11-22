# Privacy impact: 004-audit-identity

Draft, waiting at gate G3. Protected data touched: the nine services, through the audit record each of them writes.

## Purpose
To make the record of each access to patient data name the person who made it, so that a disclosure can be accounted for. No other use is added.

## Minimum fields
One field changes its content: the user identifier, which becomes the subject of the validated token. No field is added. The path, which can contain a patient identifier, is recorded as it is today.

## Lineage
A request reaches a service through the gateway, or through the bff and then the gateway's routes. The service authenticates it, and the audit middleware writes one row to that service's own `phi_audit_logs` table and one event to the audit event stream. The identity-service reads its own table for the audit export. Nothing else reads the record.

## Retention
Unchanged by this spec. The retention of audit records is not set anywhere in the repository; it is one of the questions waiting for the owner.

## Access paths
The audit export and summary endpoints of the identity-service, guarded by the PlatformAdmin policy; the audit event stream; and direct access to each service's database.

## Who can see what
Platform administrators see the user identifier, method, path, status and time of each access, through the export. A user identifier is a subject from the identity provider, not a name. Before this change the field held the same word for everyone, so this is the first time the export shows who accessed what; that is the purpose.
