# Privacy impact: 013-migrations-production-engine

Draft, waiting at gate G3. Protected data touched: the nine services and the nine schemas they own.

## Purpose
To make each database's schema the one its service's model describes, and to prove it before a release. No new use of any data is added.

## Minimum fields
No field is added for a purpose. In the breaking case a column is duplicated for the length of a migration and the old one is then removed.

## Lineage
Requests reach the services through the gateway and the bff. Each service reads and writes its own schema. The comparison in the plan uses schema-only copies, which hold table and column definitions and no rows. The conversion in the migrate step runs inside the production database and moves no data out of it.

## Retention
Unchanged. Schema-only copies are deleted when the comparison is recorded.

## Access paths
The release job that applies migrations, which gains the right to change a schema and loses nothing else; the person who takes the schema-only copies.

## Who can see what
Nobody sees a row who could not before. The schema-only copies show table and column names to whoever runs the comparison.
