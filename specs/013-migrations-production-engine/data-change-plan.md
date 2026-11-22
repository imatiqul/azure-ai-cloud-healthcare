---
stores: [identity-db, voice-db, agent-db, fhir-db, ocr-db, scheduling-db, notification-db, pophealth-db, revenue-db]
classification: breaking
migrations: []
---
# Data-change plan: 013-migrations-production-engine

Draft, waiting at gate G3. Written before anyone has looked at a production schema. The classification is the worst of the three cases in the plan; step 1 of the plan can lower it for any service, and the Data Owner records that per service.

## Classification
Breaking, for any service whose production schema has a column of a different type than the model, or lacks a column the code writes. Additive or no change at all, for a service whose production schema equals the model. Which service is which is not known: the migration files mix PostgreSQL and SQLite column types, a migration that collided was recorded as applied, and no schema has been compared.

## Forward migration
Per service, after step 1: a new baseline generated on PostgreSQL that builds the model's schema from empty; and, where production differs, one or more migrations that take production's schema to the model's. No migration file exists yet, which is why `migrations` above is empty.

## Expand, migrate, contract
For a column whose type differs:
1. Expand: add a new column of the right type beside the old one. The service writes both and reads the old one.
2. Migrate: copy and convert existing values in batches, and check every row; rows that do not convert are listed, not dropped.
3. Switch: the service reads the new column. One release later it stops writing the old one.
4. Contract: the old column is dropped in a later release, after a restore test of that step.
Each step is its own release, so that each can be rolled back by redeploying the previous revision.

## Rollback or roll-forward
Rebuilding the migration history: restore the history table from the copy taken before. Expand and migrate: roll back by redeploying; the old column is intact until the contract step. Contract: not reversible without a restore, which is why it is a separate release with its own restore test.

## Backfill
Only in the breaking case: the conversion in the migrate step, in batches small enough not to hold a lock for longer than a request's timeout, during a period the Data Owner agrees.

## Compatibility during rollout
During expand and migrate both columns are written, so the previous revision of a service still works. No service reads another service's database: each schema has one owner on the map.

## Index and query impact
Unknown until step 1. A type change on an indexed column rebuilds the index; the plan measures that on the copy before it is done in production.

## Tenant isolation
Unchanged. This plan changes how schemas are built and checked, not which rows a tenant can see.

## Retention and deletion
Unchanged. The schema-only copies hold no rows. The converted values in the migrate step are subject to the same retention as the columns they replace.

## Field classification and encryption
The nine databases hold protected health information, and each is classified restricted on the map. No field's classification changes. A converted column keeps the encryption of the column it replaces; spec 009 owns field encryption.

## Readers and writers
From the system map: each schema is owned and written by its own service (identity-service, voice-service, agent-service, fhir-service, ocr-service, scheduling-service, notification-service, pophealth-service, revenue-service), and no other reader or writer is recorded. During expand and migrate each service writes both columns of its own schema.
