# Task Lists API

## Routes
- `GET /api/v1/tasklists`
- `POST /api/v1/tasklists`
- `POST /api/v1/tasklists/[taskListId]/clone`

## Auth
Clerk auth; derives internal `User`.

## GET `/tasklists`
Fetches the authenticated user's task lists (optionally filtered by `role`).
- Ensures default daily/weekly lists exist.
- Calculates collaborator earnings, job-based completion data, and premium-factored task financials from budget distribution.

## POST `/tasklists`
Multiplexed operation handler based on body flags:

| Body flag | Action |
|---|---|
| `deleteTaskList` + `taskListId` | Delete a task list |
| `recordCompletions` | Record day/week completions |
| `updateTaskCompletion` | Update single task completion/uncompletion |
| `ephemeralTasks` | Process ephemeral task operations |
| `updateTaskStatus` | Update task status/count/times |
| `updateTaskRedacted` | Toggle task redacted state |
| `taskListId` + `create: false` | Update existing task list |
| `create` / fallback | Create or update task list by role |

Creates/updates sanitize name/tasks, localize default list names, translate template tasks, and optionally update the linked template.

## POST `/tasklists/[taskListId]/clone`
Clones a public or owned task list into a new private list. Regenerates task IDs; copies budget/premium/dueDate and `templateTasks`.

## Dependencies
- `src/lib/services/tasklist`
- `src/lib/services/task/taskMigrationService`
- `src/lib/utils/earningsUtils`
- Prisma models: `List`, `Task`, `Template`, `Day`, `User`

## Notes
`src/app/api/v1/tasklists/handlers/updateTaskCompletion.ts` implements the legacy embedded-task completion flow (updates `completedTasks`, `Day.tasks`, `Day.ticker`, stash/profit).
