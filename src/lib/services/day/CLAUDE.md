# Day Service

## Purpose

Centralized Day-model operations: progress/productivity calculated from `Job` records (not embedded tasks), plus response/analytics transformations (mood normalization, date periods, entity quality mappings, profit from ticker, single-day response assembly). Serves the days, user, jobs, and user-dashboard-data API routes, and supplies `MoodKey` types to the agent RAG service.

## Files

- `dayProgressService.ts` — Day.progress/productivity computed from ACCEPTED jobs, find-or-create Day updates
- `dayTransformService.ts` — mood/quality/date transforms + analytics and single-day response builders
- `index.ts` — barrel export of types + both services
- `types.ts` — `Mood`, `DayAnalytics`, `DayRecord`, `DayWithRelations`, `QualityMapping`, `DatePeriods`, etc.

## Key Exports

| Export | Purpose |
|---|---|
| `MOOD_KEYS` / `MoodKey` | canonical mood dimension keys |
| `calculateDayProgressFromJobs` | per-list productivity + overall progress for a date from ACCEPTED jobs |
| `updateDayProgress` | find-or-create Day for a date and persist `progress`/`productivity` |
| `updateMultipleDaysProgress` | loop of `updateDayProgress` for bulk Job operations |
| `createDefaultMood` / `normalizeMood` / `calculateMoodAverage` / `mergeMoodUpdates` | mood defaulting, normalization, averaging, partial-update merging |
| `calculateDatePeriods` | week/month/quarter/semester from a date |
| `extractQualityMappings` / `extractEntityIds` / `buildAnalysisData` | quality mapping and entity-id extraction |
| `calculateProfitFromTicker` | ticker profit (see Notes quirk) |
| `transformDayForAnalytics` | Day → analytics response (mood average fallback, profit, balances) |
| `fetchDayRelations` / `transformSingleDayResponse` | related persons/things/events fetch + quality merge + single-day response |
| `parseNumericValue` | string-or-number coercion |

## Consumers

- `src/app/api/v1/days/route.ts` — full transform suite
- `src/app/api/v1/user/route.ts` — `calculateDatePeriods`, `parseNumericValue`
- `src/app/api/v1/user-dashboard-data/route.ts` — `transformDayForAnalytics`
- `src/app/api/v1/jobs/route.ts`, `src/app/api/v1/jobs/[jobId]/route.ts` — `updateDayProgress`
- `src/lib/services/agent/` — `MoodKey` only

## Cross-References

- `src/app/api/v1/days/CLAUDE.md`, `src/app/api/v1/jobs/CLAUDE.md`, `src/app/api/v1/user-dashboard-data/CLAUDE.md`, `src/app/api/v1/user/CLAUDE.md`
- Sibling `src/lib/services/agent` (consumes `MoodKey`; documents its own "honest" profit calc)

## Notes

- `calculateProfitFromTicker` reads a `profit` field on ticker entries that no writer sets; the agent service's `calculateDayProfit` (`{earnings, premium}`) documents this as known divergence.
- Total-task count in progress calculation is a stub baseline ("simple count of all tasks in the list").
