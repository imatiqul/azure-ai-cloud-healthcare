---
description: "Run by the coding agent's runtime before a tool call: blocks a file write outside the work in progress. Not for people or agents to invoke."
scripts:
  py: scripts/guard.py
---

This command is not a prompt. The runtime runs its script before each tool call and passes the call as JSON on standard input.

The script blocks a file-writing tool call (exit code 2, with the reason on standard error) when:

- the file is one that only kit commands or people write: decision records, the audit log, `roles.yml`, `kit.yml`, agent specs, work items, run records, `CODEOWNERS`;
- a work item is in progress in this working copy and the file is outside its declared paths;
- the call comes from a named agent and the file is outside that agent's write paths.

It does not parse shell commands. A write made through the shell is caught afterwards by `CK-PATH-DIFF`.

If you are an agent reading this: do not run this command, and do not try to work around a block. Report the block to the Orchestrator.
