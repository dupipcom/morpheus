# Tasks API

## Routes
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/[taskId]`
- `PUT /api/v1/tasks/[taskId]`
- `DELETE /api/v1/tasks/[taskId]`
- `GET /api/v1/tasks/migrate`
- `POST /api/v1/tasks/migrate`

## Auth
Clerk auth (collection uses `auth()`; `[taskId]` uses `getAuthenticatedUser()`).

## GET `/tasks`
Two modes:
1. **Date-aware** (`date` + `listId`): verifies list access, uses `getTasksForDate`, and returns date-specific status/count/completers plus premium-factored financials.
2. **Legacy filters** (`listId`, `status`, `area`): returns tasks with jobs/candidates/transactions, filters by list membership, derives status from accepted jobs, and applies budget-distribution financials.

## POST `/tasks`
Creates a `Task`. Requires `name`, `area`, `listId`. Only OWNER/MANAGER. Sanitizes `name`.

## GET `[taskId]`
Returns a task with financials if the current user is a list member.

## PUT `[taskId]`
Updates a task. Requires OWNER/MANAGER/COLLABORATOR role. Sanitizes `name`. `count` is read-only (derived from jobs).

## DELETE `[taskId]`
Deletes a task. Requires OWNER/MANAGER.

## `tasks/migrate`
- `GET`: checks whether a list needs migration (any member).
- `POST`: migrates legacy embedded tasks to the `Task` collection (OWNER/MANAGER only), with an in-memory per-list mutex and ObjectId validation.

## Dependencies
- `src/lib/services/task`, `src/lib/services/auth`
- `src/lib/services/task/taskMigrationService`
- `src/lib/utils/earningsUtils`
- Prisma models: `Task`, `List`, `Job`, `Transaction`, `User`
