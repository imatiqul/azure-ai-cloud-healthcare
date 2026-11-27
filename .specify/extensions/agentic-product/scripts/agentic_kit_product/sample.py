"""Self-test material for the product extension: extends the sample project and adds one broken variant per check."""
from __future__ import annotations

from pathlib import Path

import yaml

from agentic_kit import selftest
from agentic_kit.core import KIT_DIR

SPEC = selftest.SPEC
BASE = f"specs/{SPEC}"
SPECFILE = f"{BASE}/spec.md"
PRODUCT = f"{KIT_DIR}/product"
DELTA = f"{BASE}/deltas/greeting.md"
SPEC_FILES = ["deltas/greeting.md", "origin.yml", "outcomes.yml"]
G1 = f"{KIT_DIR}/decisions/{SPEC}/G1.yml"
RECORD = f"{KIT_DIR}/intake/jira-demo-1.yml"

ADOPTION_DELTA = """---
capability: sign-in
title: Sign-in
owner_role: product-owner
purpose: Let a person prove who they are before using the product.
nodes: [demo-app]
---
## ADDED Requirements

### Requirement: Sign in with a password
The system SHALL let a user sign in with an email address and a password.

#### Scenario: Correct password
- GIVEN a user with an account
- WHEN the user enters the right password
- THEN the user is signed in
"""
GREETING_DELTA = """---
capability: greeting
title: Greeting
owner_role: product-owner
purpose: Greet the people who use the product.
nodes: [demo-app]
---
## ADDED Requirements

### Requirement: Greet by name
Verifies: FR-001
The system SHALL greet the user by name.

#### Scenario: A name is given
- GIVEN a name
- WHEN the user is greeted
- THEN the reply contains the name
"""
GLOSSARY = """schema: agentic-glossary/1
terms:
  - term: user
    definition: A person who is signed in to the product.
    avoid: [customer, end user]
"""
OUTCOMES = """schema: agentic-outcomes/1
outcomes:
  - id: O-1
    hypothesis: People who are greeted by name come back more often
    metric: share of users who return within seven days
    baseline: 41%
    target: 45%
    source: product analytics, weekly retention report
    review_by: 2099-01-01
"""
#: What was said on the work item, made up. The sample keeps a count and a hash of it and none of the text (CNV-6).
SAID = [{"id": "10001", "author": "pat", "body": "Greet by the name on the account, not by the email address."},
        {"id": "10002", "author": "sam", "body": "Agreed. What is said when the account has no name?"}]
CONVERSATION = {"summary": "pat asked for a greeting that uses the person's name. sam agreed to take the name from the account.\n"
                           "Left open: what to say when the account has no name.",
                "links": ["https://example.atlassian.net/browse/DEMO-1"], "people": ["pat", "sam"],
                "captured_on": selftest.TODAY, "captured_by": "spec-author", "confirmed_by": "alice"}
OTHER_SPEC = """---
spec: {id}
tier_declared: low
owner_role: backend
---
# Feature Specification: {title}

## Requirements
- **FR-001**: {requirement}

## Acceptance Criteria
- **AC-001** (verifies FR-001): Given a name, When the user arrives, Then the reply contains the name.
"""


def extend_sample(root: Path) -> None:
    from . import conversation, intake, living
    w = selftest._write
    w(root, f"{PRODUCT}/index.yml", yaml.safe_dump({"schema": "agentic-product-index/1", "exempt": [], "order": []}, sort_keys=False))
    w(root, f"{PRODUCT}/glossary.yml", GLOSSARY)
    w(root, f"{PRODUCT}/adoption/sign-in.md", ADOPTION_DELTA)
    living.merge(selftest.context(root), None, {"reviewer": "alice", "role": "product-owner", "review_ref": "pull/1#review-1"}, write=True)
    w(root, DELTA, GREETING_DELTA)
    w(root, f"{BASE}/outcomes.yml", OUTCOMES)
    first = intake.make_record("jira", "DEMO-1", "Greet people by name", "As a user I want to be greeted by name, so that the product feels personal.",
                               url="https://example.atlassian.net/browse/DEMO-1", revision="3", fetched=selftest.TODAY, via="backlog")
    first.update({"status": "specified", "spec": SPEC, "discussion": conversation.digest(SAID, fetched=selftest.TODAY)})
    second = intake.make_record("jira", "DEMO-2", "Say hello using the person's name", "Show the name of the person in the hello message.",
                                url="https://example.atlassian.net/browse/DEMO-2", revision="1", fetched=selftest.TODAY)
    second.update({"status": "duplicate", "disposition": {"decision": "duplicate-of", "target": first["id"], "reason": "Same request from another team",
                                                           "decided_by": {"reviewer": "alice", "role": "product-owner"}}})
    for rec in (first, second):
        intake.write_record(root, rec)
    w(root, f"{BASE}/origin.yml", conversation.dump({"schema": "agentic-origin/1", "intake": [first["id"]], "dispositions": [],
                                                      "conversation": CONVERSATION}))


def _open(root: Path) -> None:
    """Make the sample spec's wording unapproved again."""
    (root / G1).unlink()


def _append(rel: str, text: str):
    def go(root: Path) -> None:
        with (root / rel).open("a", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
    return go


def _release(root: Path) -> None:
    """Give the sample spec the two decisions it still lacks, so it counts as released."""
    for gate in ("G6", "G7"):
        selftest._dump(root, f"{KIT_DIR}/decisions/{SPEC}/{gate}.yml", {"schema": "agentic-decision/1", "spec": SPEC, "gate": gate, "decision": "approve"})


def _merge(root: Path) -> None:
    from . import living
    _release(root)
    living.merge(selftest.context(root), SPEC, write=True)


def _moved(root: Path) -> None:
    """One more comment on the work item, found by a fetch after the spec was written."""
    from . import conversation, intake
    later = SAID + [{"id": "10003", "author": "pat", "body": "Use the first name only."}]
    conversation.store_digest(root, intake.record_id("jira", "DEMO-1"), conversation.digest(later, fetched="2026-11-25"))


def _second_spec(sid: str, title: str, requirement: str, delta: str | None = None):
    def go(root: Path) -> None:
        selftest._write(root, f"specs/{sid}/spec.md", OTHER_SPEC.format(id=sid, title=title, requirement=requirement))
        if delta:
            selftest._write(root, f"specs/{sid}/deltas/greeting.md", delta)
    return go


def fixtures() -> dict:
    E, many = selftest._edit, selftest._many
    return {
        "CK-INTAKE-RECORD": ("an intake record's text was edited by hand", E(RECORD, "greeted by name", "greeted by first name"), {}, {}),
        "CK-INTAKE-DRIFT": ("the work item changed at its source after the spec was written and nobody looked",
                            _append(RECORD, 'latest: {hash: "sha256:' + "ab" * 32 + '", revision: "7", fetched: 2026-11-21}\n'), {}, {}),
        "CK-REQ-QUALITY": ("a requirement still to be approved says 'should' and 'quickly'",
                           many(_open, E(SPECFILE, "System MUST greet the user by name.", "System should greet the user quickly.")), {}, {}),
        "CK-SPEC-SIZE": ("a spec still to be approved is larger than the limit",
                         many(_open, _append(f"{KIT_DIR}/kit.yml", "requirements:\n  limits: {requirements: 0}\n")), {}, {}),
        "CK-GLOSSARY": ("a spec still to be approved says 'customer' where the agreed term is 'user'",
                        many(_open, E(SPECFILE, "greet the user by name", "greet the customer by name")), {}, {}),
        "CK-DUPLICATE": ("a new spec repeats a requirement that is already in flight and nobody decided whether it is a duplicate",
                         _second_spec("002-greet-again", "Greet again", "System MUST greet each user by their name."), {}, {}),
        "CK-DELTA-VALID": ("a delta verifies a requirement the spec does not have", E(DELTA, "Verifies: FR-001", "Verifies: FR-009"), {}, {}),
        "CK-CAPABILITY-COVERAGE": ("a change does not say how behaviour changes", lambda root: (root / DELTA).unlink(), {}, {}),
        "CK-LIVING-SPEC": ("a living spec was edited by hand",
                           E(f"{PRODUCT}/capabilities/sign-in/spec.md", "an email address and a password", "an email address"), {}, {}),
        "CK-DELTA-MERGED": ("a change was released and its deltas were never merged", _release, {}, {"today": "2027-06-01"}),
        "CK-SPEC-COLLISION": ("two changes in flight add the same requirement and neither says which goes first",
                              _second_spec("002-other", "Other greeting", "System MUST greet the user by name on the home page.", GREETING_DELTA), {}, {}),
        "CK-ARCHIVE": ("a merged change was never sealed", _merge, {}, {"today": "2027-06-01"}),
        "CK-OUTCOME": ("a high-tier change does not say what result it expects", lambda root: (root / BASE / "outcomes.yml").unlink(), {}, {}),
        "CK-CONVERSATION": ("the discussion on the work item moved after the spec was written and nobody looked", _moved, {}, {}),
    }
