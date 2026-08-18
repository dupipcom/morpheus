# Tasks API

## Routes
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/past-pending`
- `GET /api/v1/tasks/[taskId]`
- `PUT /api/v1/tasks/[taskId]`
- `DELETE /api/v1/tasks/[taskId]`
- `POST /api/v1/tasks/[taskId]/apply` (Phase 5 job posts — body `{ message?, documentIds? }`)
- `GET /api/v1/tasks/[taskId]/applications` (owner/manager of the owning list)
- `POST /api/v1/tasks/[taskId]/applications/[applicationId]` (accept/shortlist/decline/withdraw; body `{ status }`)
- `GET /api/v1/tasks/migrate`
- `POST /api/v1/tasks/migrate`

## Auth
Clerk auth (collection uses `auth()`; `[taskId]` uses `getAuthenticatedUser()`).

## GET `/tasks`
Date-aware mode only: requires `date` (YYYY-MM-DD) and `listId`.
- Verifies list membership, uses RRULE-based `getTasksForDate` (weekly tasks aggregate jobs across the week), and returns date-specific `dateStatus`/`dateCount`/`completers`.
- Financials come from the simplified premium service: task premium (fiat or % of list budget, premium-factored) + equal share of the list budget.

## POST `/tasks`
Creates a `Task`. Requires `name` and `listId`; only OWNER/MANAGER. Sanitizes `name`.
Body fields: `{ name, listId, rrule?, dtstart?, times?, premium?, premiumType?, location?, categories?, area?, status?, visibility?, quality?, redacted?, candidateIds?, localeKey? }`.
`rrule` is an RFC-5545 string (null = one-off task that appears on every date).

## GET `tasks/past-pending`
Past occurrences of the list's tasks that are still pending or under review (jobs in
REQUESTED/IN_PROGRESS/SUBMITTED/VALIDATING), newest occurrence first.
- Params: `listId` (required), `before` (YYYY-MM-DD, default today, exclusive upper bound),
  `windowStart` (YYYY-MM-DD, lower bound — applied only on the first page), `cursorDate` +
  `cursorId` (composite cursor for older pages), `limit` (default 20, max 50).
- Returns `{ entries, nextCursor }`; each entry is a task enriched like GET `/tasks` plus
  `jobs`, `occurrenceDate`, `dateStatus`, `dateCount`. One entry per (taskId, occurrenceDate).

## GET `[taskId]`
Returns a task with jobs/candidates and simplified financials if the current user is a list member.

## PUT `[taskId]`
Updates a task. Requires OWNER/MANAGER/COLLABORATOR. Sanitizes `name`.
Setting `status: "COMPLETED"` records `completedOn` (criterion: complete by status); un-completing clears it.

## DELETE `[taskId]?scope=&date=`
Deletes a task with a scope. Requires OWNER/MANAGER.
- `scope=all` (default): deletes the task and its jobs.
- `scope=today` (+ `date`): soft-cancels the jobs on that date (ACCEPTED earnings reversed).
- `scope=onwards` (+ `date`): soft-cancels jobs from that date onwards and stops the task occurring from that date — recurring tasks get an RRULE `UNTIL` cap (day before), one-off tasks get `COMPLETED`/`completedOn` (day before).

Jobs are never hard-deleted by scoped deletes: they carry financial history (CANCELLED status).

## `tasks/migrate`
DEPRECATED: legacy embedded-task conversion now happens via one-time migrations 0017-0019. Kept for API compatibility:
- `GET`: always reports `needsMigration: false`.
- `POST`: no-op returning an empty `MigrationResult`.

## Dependencies
- `src/lib/services/task` (recurrenceService, taskCompletionService, taskMigrationService stubs)
- `src/lib/services/finance/premiumService`
- `src/lib/services/job/earningsService` (earnings reversal on scoped deletes)
- `src/lib/services/auth`
- Prisma models: `Task`, `List`, `Job`, `Document`, `User`
