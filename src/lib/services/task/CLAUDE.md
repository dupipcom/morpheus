# Task Service

## Purpose

Task recurrence/occurrence engine and completion logic: which tasks appear on which date (RRULE-based), date-specific status aggregation from Jobs, and one-off task completion state. `taskMigrationService.ts` is a deprecated runtime no-op — migrations now live in `src/migrations/0017-0019`.

## Files

- `recurrenceService.ts` — RRULE parsing, occurrence checks, per-date task fetching
- `taskCompletionService.ts` — completion counts/status from ACCEPTED jobs
- `taskMigrationService.ts` — deprecated stub (always reports migration complete)
- `types.ts` — migration types
- `index.ts` — barrel re-export of all four modules

## Key Exports

| Export | Purpose |
|---|---|
| `getTasksForDate` | Tasks for a date with jobs aggregated (weekly tasks across whole week), `dateStatus` derived from ACCEPTED-job counts vs `times` |
| `taskOccursOnDate` | RRULE occurrence check; no-rrule = one-off (always appears); legacy WEEKLY w/o BYDAY = all days; COMPLETED hidden in recurring lists |
| `getWeekRange` | Monday–Sunday range + all 7 dates (UTC) |
| `rruleFrequency` | Extract `FREQ` value from an RRULE string |
| `getTaskCompletionCountForDate` / `getTaskTotalCompletionCount` / `calculateStatusFromCount` | Completion counts + DONE/IN_PROGRESS/OPEN status |
| `updateTaskOccurrenceDates` | One-off tasks flip to COMPLETED (or back to OPEN) on complete/delete |
| `getTaskCompletersHistory` / `isTaskCompletedForDate` / `getTaskCompletionPercentageForDate` | Analytics/completion helpers |
| `migrateListTasks` / `listNeedsMigration` | Deprecated no-ops kept for `/api/v1/tasks/migrate` API compatibility |

## Consumers

- `src/app/api/v1/tasks/route.ts`, `src/app/api/v1/tasks/migrate/route.ts`
- `src/app/api/v1/jobs/route.ts`, `src/app/api/v1/jobs/[jobId]/route.ts`
- `src/lib/services/finance/premiumService` (`rruleFrequency`)

## Cross-References

- `src/app/api/v1/tasks/CLAUDE.md`, `src/app/api/v1/jobs/CLAUDE.md`
- Migration path: `src/migrations/0017-0019` (see `scripts/README-migration.md`)
- Sibling: `src/lib/services/list` (lists own the Task records), `src/lib/services/finance/premiumService`
- `src/lib/services/CLAUDE.md`
