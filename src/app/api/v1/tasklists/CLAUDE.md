# Task Lists API

## Routes
- `GET /api/v1/tasklists`
- `POST /api/v1/tasklists`
- `GET /api/v1/tasklists/[taskListId]`
- `PUT /api/v1/tasklists/[taskListId]`
- `DELETE /api/v1/tasklists/[taskListId]`
- `POST /api/v1/tasklists/[taskListId]/clone`

## Auth
Clerk auth; derives internal `User`.

## GET `/tasklists`
Fetches the authenticated user's task lists (optionally filtered by `role`).
- Ensures the default daily/weekly lists exist (created from `DAILY_ACTIONS`/`WEEKLY_ACTIONS` constants, localized via `dpip_user_locale`/Accept-Language).
- Adds job-based completion data per list (`jobCompletedTasks`).

## POST `/tasklists`
Creates a task list (create-only; updates go through `PUT /tasklists/[taskListId]`).

Body: `{ name?, role?, visibility?, categories?, area?, collaborators?, budget?, budgetType? ("FIAT"|"PERCENT"), budgetPercent?, budgetSourceIds?, bio?, profilePhoto?, links?, tasks?[] }`
- `tasks` entries: `{ name, rrule?, dtstart?, times?, premium?, premiumType?, localeKey?, categories?, area?, visibility?, quality?, redacted? }`.
- Generates a unique `publicUrl` slug from the name.

## GET `/tasklists/[taskListId]`
Returns the list with its tasks (members only). Owners/managers also receive `pendingRequests` (PENDING `ListRequest` records).

## PUT `/tasklists/[taskListId]`
Updates list fields (name, role, visibility, categories, area, collaborators, budget fields, bio, profilePhoto, links). OWNER/MANAGER only.

## DELETE `/tasklists/[taskListId]`
Deletes the list (tasks/jobs cascade). OWNER only. Recalculates the owner's budget usage.

## POST `/tasklists/[taskListId]/clone`
Clones a public or owned task list into a new private list. Clones the Task collection records (reset to OPEN), budget fields, and profile fields; generates a new `publicUrl`.

## Dependencies
- `src/lib/services/tasklist` (CRUD service, helpers, list completion)
- `src/lib/services/auth` (role checks)
- Prisma models: `List`, `Task`, `ListRequest`, `Budget`, `User`

## Notes
The legacy multiplexed POST (completions/status/ephemeral/redacted operations) was removed in the Do rebuild (#441 follow-up). Task mutations now live on `/api/v1/tasks`; completions on `/api/v1/jobs`.
