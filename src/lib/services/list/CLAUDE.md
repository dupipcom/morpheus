# List Service

## Purpose

Task list (List model) CRUD plus Job-based completion calculation. Formerly `tasklist/`; seeds default daily/weekly lists directly from `DAILY_ACTIONS`/`WEEKLY_ACTIONS` constants (no Template dependency). Phase note: legacy frontend types in `types.ts` remain exported until the Do view rebuild lands.

## Files

- `taskListCrudService.ts` — create/read/update/delete lists + default seeding
- `listCompletionService.ts` — completion % from ACCEPTED Jobs (not embedded completedTasks)
- `publicListService.ts` — Phase 5 public surface: allowlist-projected list payload + job-board discovery feed
- `helpers.ts` — pure, DB-free utilities (IDs, locale, budget parsing)
- `types.ts` — TaskList/Task/Day/Ephemeral types + `TASK_ALLOWED_KEYS`
- `index.ts` — barrel re-export of all public surface

## Key Exports

| Export | Purpose |
|---|---|
| `getTaskListsForUser` | Lists where user is OWNER/MANAGER/COLLABORATOR, with tasks + usernames enriched |
| `ensureDefaultTaskLists` | Idempotent daily/weekly list + Task seeding from constants |
| `createTaskList` / `updateTaskList` / `deleteTaskList` | List CRUD (create demotes existing default; all call `recalculateUserBudget`) |
| `getTaskListWithTasks` | List with tasks |
| `getPublicTaskList` | Public list payload (allowlist projection: public tasks, owner/collaborator profiles, project chip, like/viewer state); 404 unless `publicVisible` + `visibility: PUBLIC` |
| `listPublicTaskLists` | Job-board discovery feed (`q`/`area`/`category` filters, cursor pagination, batched profiles + like counts) |
| `generatePublicUrl` | Collision-safe public slug (via `buildPublicSlug`) |
| `calculateListCompletionFromJobs` / `calculateYearCompletionFromJobs` / `getListCompletionData` | Completion % per date/year from unique ACCEPTED-job tasks |
| `generateObjectId` / `ensureUniqueTaskIds` / `translateTemplateTasks` / `getUserLocale` / `getLocalizedListName` / `parseBudget` / `getUserBalanceValues` | Pure helpers |

## Consumers

- `src/app/api/v1/tasklists/route.ts`, `src/app/api/v1/tasklists/[taskListId]/route.ts`, `src/app/api/v1/tasklists/[taskListId]/clone/route.ts`

## Cross-References

- `src/app/api/v1/tasklists/CLAUDE.md`
- Sibling: `src/lib/services/task` (recurrence/completion), `src/lib/services/finance/premiumService` (budget fields)
- `src/app/constants.ts` (`DAILY_ACTIONS`/`WEEKLY_ACTIONS`)
- `src/lib/services/CLAUDE.md`
