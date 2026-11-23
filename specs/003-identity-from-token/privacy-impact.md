# Privacy impact: 003-identity-from-token

Draft, waiting at gate G3. Protected data touched: the identity-service, which holds user accounts, consent and break-glass grants.

## Purpose
To make the tenant and the user of every request the ones in the validated token, so that access to patient data is decided and recorded for the right organisation and the right person.

## Minimum fields
No field is added. The break-glass grant keeps its fields; the requester's value now comes from the token. The request body's `RequestedByUserId` is no longer used.

## Lineage
A request reaches the identity-service through the gateway. The tenant guard reads the token's tenant claim and compares it with the header, if one was sent. A break-glass grant is written to the identity service's database and announced as an event; nothing in this repository subscribes to that event.

## Retention
Unchanged by this spec.

## Access paths
The break-glass endpoints, which gain a named policy; the identity service's database; the event.

## Who can see what
Unchanged, except that a caller without the break-glass role can no longer create, read or revoke a grant.
