---
version: 2
from_version: 1
from_commit: 771b99a (agentic-spec-kit, where version 1 was recorded as approved)
changed:
- P-7
removed: []
added: []
invalidated_specs: []
---
# Constitution amendment, version 2

Written by hand in the kit's format. The kit generates this report from a G0 decision record, and the reference has none yet: G0 was approved in conversation, both times.

- **Changed:** P-7
- **Removed:** none
- **Added:** none

## What changed
P-7 no longer says PHI is redacted before it reaches "a browser". It still says PHI is redacted before it reaches a model provider or a log, that redaction is not behind a feature flag, that PHI fields are encrypted at rest, and that no patient identifier or conversation is kept in browser storage. The checks named for P-7 are unchanged.

## Approved specs this invalidates
No approved spec relies on the words that were removed. `009-phi-protection` cites P-7; it was approved at G1 and G2 in the same message that approved this amendment, and it was written to the meaning P-7 now has.
