# T001, first rework round: the middleware

- **Phase and date:** Phase 7, 2026-11-22
- **Upstream and reference:** spec-kit `v1.4.3`; this repository, branch `sdd/004-audit-identity`, on `main` at `8d04df3`
- **Requirement IDs exercised:** AGT-5, AGT-6
- **Assumptions:** the stand-ins behave as the real packages do for the calls these tests make
- **Unverified:** the solution was not restored, built or tested. This is not a run of `tests/HealthQCopilot.Tests.Unit`

## Why it came back

The security reviewer returned the item for S-8 and the part of S-4 that is in this file (`reviews/G5-security.md`). The independent verifier's notes V-8 and V-10 are about the same lines (`verification/G6-report.md`).

## What changed

| Finding | Change |
|---|---|
| S-8, V-8: authentication was checked on the first identity and the subject read from any | `ResolveUserId` reads the subject from an identity that is authenticated, and from no other. Two identities, in either order, give the same answer when one of them is not authenticated, which is what the tests cover. **Corrected after the second round:** with two authenticated identities the first that has a subject is recorded, so their order decides (the verification, round 2, H7 and H10). No policy in the nine services names two schemes today |
| S-4: the lines written after the pipeline named no user, so only the log scope did, and the scope's user can come from a request header | `PHI_ACCESS_COMPLETE` names the user of the record. The line for a row that could not be saved names the user, the method, the status and the correlation id |
| S-14, point 2: the class comment said rows cannot be altered | The comment says nothing enforces that yet |

Not changed, and why:
- S-5, V-10 (a request that ends in an exception leaves no record): older than this change; the reviewer did not require it here. It is in the threat model's open list for spec 015.
- S-6 (the demo identity recorded as a person): the cause is finding C1. The rollout now waits for spec 001 and halts on that value.
- S-7 (which identifier): the owner's decision; see the plan, "For the reviewer".
- Whether logs should carry the identifier at all (S-3, point 3) is the owner's decision. This round keeps the identifier on the lines that had a user and makes them name the right one. Taking it off is one argument on each of three log calls.

## Result

`python <agentic-spec-kit>/examples/healthq/phase-7/harness/run.py --repo .`, with the tests as they were handed off before the reviews (T003 and T004 are reworked after this item):

```
49 passed, 0 failed
```

The tests for the new behaviour are in T003's rework.
