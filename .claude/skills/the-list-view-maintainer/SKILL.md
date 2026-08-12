---
name: the-list-view-maintainer
description: Maintains and enhances the ListView task grid component with completion tracking and job management.
license: HPL3-ECO-NC-ND-A 2026
---

Task: Develop, fix, or enhance the ListView task grid component and its data processing logic.

Role: You're a front-end engineer maintaining the core task display and interaction layer.

## Reference
For detailed documentation on the ListView's architecture, data processing pipeline, API endpoints, and user stories, read `src/views/list/CLAUDE.md` first.

## Scope
- `src/views/list/listView.tsx` - Task grid view with SWR data fetching
- `src/components/taskGrid.tsx` - Task card rendering component
- `src/lib/hooks/useOptimisticUpdates.ts` - Pending task tracking
- `src/lib/utils/earningsUtils.ts` - Earnings/profit calculation helpers
- `src/app/helpers.ts` - Week number calculation (`getWeekNumber`)

## Critical Data Flow
1. Tasks are fetched via SWR from `/api/v1/tasks?listId=X&date=Y`
2. API response maps to `tasksToDisplay` with `dateCount` and `dateStatus`
3. Optimistic tasks (from `pendingTaskCreationsRef`) are prepended to display
4. When API confirms tasks, optimistic entries are cleaned up

## Task Merging Architecture
```
selectedTaskList.completedTasks[year][date]
├── openTasks   → base tasks (in-progress/open)
├── closedTasks → completed tasks (overlay on base)
└── (legacy array format) → auto-migrated to openTasks/closedTasks
```
Plus:
- `tasklist.tasks` → blueprint tasks (Task collection)
- `tasklist.ephemeralTasks.open/closed` → ad-hoc tasks (filtered by date)

## Development Rules
- Never modify `mergedTasks` logic without thorough testing of daily + weekly modes
- Task key extraction: `id || localeKey || name.toLowerCase()` - handle all three
- Collaborator profiles must be fetched once per list change, not on every render
- Ephemeral tasks must be deduplicated against main task list (key-based dedup)
- Migration uses `migratedListsRef` (Set) to prevent re-migration in same session
- Migration checks `isInitializingTaskLists` to prevent premature triggering
- SWR uses `revalidateOnFocus: false` to prevent unnecessary refetches

## Common Operations
- **Adding job types**: Update the jobs URL construction and the `TaskGrid` component
- **Modifying task display**: Update `tasksToDisplay` memo (API task mapping)
- **Adding collaborator features**: Extend `collabProfiles` state and the profiles fetch

## Validation Checklist
- [ ] Daily lists show correct tasks for selected date
- [ ] Weekly lists aggregate tasks across all 7 days of the week
- [ ] Task completion states sync correctly with API
- [ ] Collaborator names appear correctly for shared lists
- [ ] Ephemeral tasks appear at correct time and are deduplicated
- [ ] Date navigation doesn't cause data flashing
- [ ] Migration logs progress and doesn't repeat on page refresh
- [ ] Loading skeleton shows during initial data fetch
