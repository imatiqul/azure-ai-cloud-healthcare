# Plan: migrations are written for, and tested on, the engine production runs (013, finding H5)

- **Phase and date:** Phase 6, 2026-11-22. Draft, waiting at gate G3. Depth for the reference: spec and plan; no task list
- **Upstream and reference:** spec-kit `v1.4.3`; healthcare repository at commit `8d04df3`
- **Requirement IDs exercised:** MAP-10 to MAP-12, GOV-10, CHG-1 to CHG-5, CHG-17 to CHG-19, QLT-3, QLT-6
- **Assumptions:** P1 to P3 under "Decisions this plan makes"
- **Unverified:** written from reading the code. No migration was generated or applied to any database. What the production databases hold is not known, and the plan is built around finding that out first

## What the code does today

- **Every service's migrations are applied by the service itself at start-up**, when `Database:UseMigrations` is on. It is off by default and on in all nine services' production settings (`src/HealthQCopilot.*/appsettings.Production.json`).
- **With it off, the schema is created from the model** with no migration history (`src/HealthQCopilot.Infrastructure/Persistence/DatabaseExtensions.cs:96-116`). The audit table is created there by a statement written by hand.
- **A migration that fails because something already exists is recorded as applied** (lines 135-164). The comment calls it brownfield handling: the database was created from the model earlier, so the first migrations collide. But a migration is one unit. If its first statement collides, the rest of it never runs, and the history says it did.
- **A failure to initialise the database is logged as a warning and the service starts anyway** (lines 122-125).
- **With no connection string a service uses a local SQLite file** (lines 54-57), and the design-time factory that exists uses SQLite (`src/HealthQCopilot.Agents/Infrastructure/AgentDbContextFactory.cs:11`).
- **The migration files are a mixture.** Some carry PostgreSQL column types and some SQLite's; Phase 1 counted 24 of 53 with SQLite types. `PendingModelChangesWarning` is ignored on PostgreSQL, with a comment that says why (lines 47-52).

So three schemas exist for each service and nothing shows they agree: the one the model describes, the one the migration files would build, and the one production has.

## The change, in the order it has to happen

1. **Measure.** For each of the nine databases, take a schema-only copy of production (the spec's A2) and build two more: one migrated from empty on PostgreSQL with today's files, one created from today's model. Compare the three. Record the differences per table and column. Nothing is changed in this step.
2. **Decide per service**, from step 1, which of three cases it is:
   - production equals the model: the migration history is rebuilt to match, and no data changes;
   - production differs from the model in a way that loses nothing (a missing index, a default): one additive migration;
   - production differs in a column's type or in a missing column that the code writes: a breaking change, done as expand, migrate, contract. The data-change plan covers this case, because it is the one that can lose data.
3. **Design-time factories for PostgreSQL** in all nine services, and the SQLite fallback removed outside tests (FR-002).
4. **New baseline migrations generated on PostgreSQL** (FR-001), and the line that ignores the warning removed (FR-003).
5. **The pipeline applies every migration to an empty PostgreSQL of the production version** when a migration or a model changes, fails when model and migrations disagree, and compares the result with the schema-only copy (FR-004 to FR-006).
6. **"Recorded as applied" is removed.** A migration that collides fails, visibly, and the service does not start.
7. **The environment parity record** is written (FR-007).

## Decisions this plan makes
- P1: migrations stop being applied by the service at start-up in production and are applied by a job in the release, before the service that needs them. Nine services each racing to migrate at start-up is how a half-applied migration becomes a running service.
- P2: step 6 is in this spec. The spec's requirements do not name it, and it is the mechanism by which a production schema can differ from its history. It is listed under "For the reviewer at G3".
- P3: the production PostgreSQL version is read from production in step 1. The map does not state it, which is one of the kit's findings on this repository.

## Risks the plan carries
- **Step 1 can show that production is already wrong.** Then the choice is between changing data in production and leaving a known difference. That is the Data Owner's decision, per service, at G3.
- **Removing the "recorded as applied" behaviour will stop a service that relied on it.** That is intended, and it needs step 2 finished for that service first.
- **Rebuilding migration history is itself a change to a production database's metadata.** It is small and it is not nothing: it is rehearsed on the copy.

## Found while planning, and not part of this change
1. The audit table is created by a hand-written statement with a timestamp column that has no time zone (`DatabaseExtensions.cs:105-115`), while the model writes UTC values. Specs 008 and 016 own the audit table.
2. Database start-up failures are swallowed (lines 122-125). That is finding M1's kind (spec 017), and it interacts with this plan: a service that could not migrate runs.

## For the reviewer at G3
- Is step 6 in scope (P2)? If not, it needs a spec of its own before this one can meet FR-006.
- Who can take the schema-only copies (step 1)? No agent has, or should have, a connection to production.
