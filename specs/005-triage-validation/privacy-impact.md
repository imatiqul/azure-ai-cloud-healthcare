# Privacy impact: 005-triage-validation

Draft, waiting at gate G3. Protected data touched: the agent-service and the triage classifier, which read what a patient says about their symptoms.

## Purpose
To propose a triage level from the patient's own words, for a clinician to confirm. No other use of the transcript is added.

## Minimum fields
The classifier reads the transcript. It no longer reads retrieved text. Each classification stores the rule that fired and the phrases that fired it, which are the patient's words; nothing else is added.

## Lineage
A transcript reaches the agent-service through the gateway, from the bff or a front end. The classifier reads it in memory. The workflow, with the proposed level, the phrases and the clinician's decision, is written to the agent service's database. After confirmation the level is announced as `triage.completed`, which the scheduling, population health and revenue services read.

## Retention
Unchanged by this spec. The phrases stored with a classification are kept as long as the workflow is.

## Access paths
The clinician's queue and the workflow endpoints of the agent-service; the agent service's database; the `triage.completed` and `escalation.required` events.

## Who can see what
A clinician sees the proposed level and the phrases that produced it. Subscribers to the events see the workflow, the session, the patient identifier and the confirmed level, as today, and now only after confirmation.
