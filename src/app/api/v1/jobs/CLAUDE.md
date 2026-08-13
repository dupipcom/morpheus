# Jobs API

## Routes
- `GET /api/v1/jobs`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs/[jobId]`
- `PUT /api/v1/jobs/[jobId]`
- `DELETE /api/v1/jobs/[jobId]`

## Auth
Clerk auth (`GET`/`POST` use `auth()`; `[jobId]` uses `getAuthenticatedUser()`).

## GET `/jobs`
Lists jobs. Query filters: `listId`, `taskId`, `workerId`, `status`, `date` (exact), or `dateStart`+`dateEnd` (range).

Privacy filtering:
- Non-list-members are excluded.
- Non-participants (collaborators who are not worker/owner/manager/reviewer) get a reduced payload without notes/reviews/detailed info.

## POST `/jobs`
Creates a job. Body: `{ taskId, listId, workerId, status?, occurrenceDate?, selfReview?, peerReview?, managerReview?, reviewerIds?, reviewersNoteIds? }`.
- `occurrenceDate` must be `YYYY-MM-DD`.
- Requires list membership with role OWNER/MANAGER/COLLABORATOR; collaborators can only create jobs for themselves.
- Verifies task belongs to list.
- If `status === 'ACCEPTED'`, initializes invoice, syncs task values, updates task occurrence dates and `Day.progress`, and applies earnings.

## GET `[jobId]`
Returns a job if the current user is a list member (any of OWNER/MANAGER/COLLABORATOR/FOLLOWER).

## PUT `[jobId]`
Updates a job with full authorization and audit logging:
- Validates status transitions (`validateStatusTransition`) and authorization (`isAuthorizedForTransition`).
- Workers cannot accept/reject their own jobs.
- Prevents duplicate accepted jobs for the same task/date.
- Own/manager review fields have role and range checks.
- Creates requester/reviewer notes (sanitized) when provided.
- Runs the update in a retrying transaction (`P2034` retries).
- On `ACCEPTED`: initializes invoice, updates occurrence dates/day progress, calculates/apply earnings, logs acceptance.
- On un-accept (was ACCEPTED, now not): reverses earnings and updates progress.
- On `IN_PROGRESS`: initializes invoice.

## DELETE `[jobId]`
Cancels a job (sets status `CANCELLED`, not hard delete). Only OWNER/MANAGER. Reverses earnings and updates task occurrence/day progress if the job was `ACCEPTED`.

## Dependencies
- `src/lib/services/job/*` (earningsService, statusValidator, taskSync, auditLogger)
- `src/lib/services/task`, `src/lib/services/day`
- Prisma models: `Job`, `Task`, `List`, `Note`, `User`
