---
description: "After release: merge the change's deltas into the living specs, seal the finished change, and note the outcome review that is due."
---

## User Input

```text
$ARGUMENTS
```

## Steps

1. Confirm the spec has passed every gate it needs: `python .specify/extensions/agentic/scripts/agentic.py lane --spec <spec>` and the gate command for the last gate. If it has not, stop and say which gate is open.
2. Preview the merge: `python .specify/extensions/agentic/scripts/agentic.py product merge --spec <spec>`. Show the user which capabilities change and how.
3. Merge: add `--write`. This rewrites the living specs and records the merge. Commit those files on a branch and open a pull request; do not push to the default branch.
4. Seal the finished change: `python .specify/extensions/agentic/scripts/agentic.py product archive --spec <spec> --write`. From here the spec folder is history: the kit fails any later edit to it.
5. Read `specs/<spec>/outcomes.yml` and tell the user the date each outcome is due for review, and who records it.
6. Run `python .specify/extensions/agentic/scripts/agentic.py product check`.

## Rules for the agent

- You do not record an outcome review. A person who holds the Product Owner role records what was measured and where the number came from.
- If the merge is refused, report the reason. Do not edit the index or a merge record to get past it; the kit replays every merge and will fail the build.
