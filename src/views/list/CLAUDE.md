# ListView - Task Grid Display

## Purpose

The ListView renders the task grid for a selected task list and date. It handles task display, completion tracking, job management, collaborator profiles, and legacy task migration. This is the core task interaction view where users complete, track, and manage their daily/weekly tasks.

## File: `listView.tsx`

## Component Architecture

```
ListView
└── TaskGrid (from components/)
    ├── Task cards with completion tracking
    ├── Job entries
    ├── Collaborator indicators
    └── Date navigation
```

## State Management

### Data Fetching (SWR)
- **Tasks**: `useSWR(/api/v1/tasks?listId=X&date=Y)` - fetches tasks for the selected date/list
- **Jobs**: `useSWR(/api/v1/jobs?listId=X&date=Y)` - fetches jobs, auto-refresh every 60s
- **Collaborator Profiles**: `fetch(/api/v1/profiles/by-ids)` - fetched once per list change

### GlobalContext Integration
- Reads `taskLists` from `GlobalContext`
- Uses `refreshTaskLists()` to trigger updates after mutations
- Maintains `stableTaskLists` to prevent UI flashing during refetches
- Uses `isInitializingTaskLists` for new-user onboarding state

### Controlled/Uncontrolled
```typescript
{
  selectedTaskListId?: string    // Controlled by parent (DoView) or internal state
  selectedDate?: Date            // Controlled by parent or internal state
  onDateChange?: (date: Date | undefined) => void
  pendingTaskCreationsRef?: Ref<Map<string, PendingTaskCreation>>
  onMutateTasksReady?: (mutate: () => Promise<any>) => void
}
```

## Key Data Processing

### Task Merging Logic
When the new Task collection API returns tasks, they are displayed directly. When no API tasks exist (legacy), the view merges:
1. **Base tasks**: From `completedTasks[year][date].openTasks` or `tasklist.tasks`
2. **Closed tasks**: From `completedTasks[year][date].closedTasks` (overlay on base)
3. **Ephemeral tasks**: From `tasklist.ephemeralTasks` (open + closed, filtered by date)

### Date Handling
- Always uses local timezone (`formatDateLocal` helper)
- Weekly lists: aggregates tasks across all 7 days of the week
- Weekly dates: computed from `getWeekDates(selectedDate)`

### Task Migration
- Detects legacy tasks without Task collection records
- Auto-triggers migration via `POST /api/v1/tasks/migrate`
- Only runs for OWNER/MANAGER roles

## Correlations

| Related To | Relationship |
|---|---|
| **DoView** | Parent component that provides controls and forms |
| **TaskGrid** | Child component that renders the task UI (from components/) |
| **GlobalContext** | Reads taskLists, calls refreshTaskLists |
| **useSWR** | Fetches tasks, jobs, profiles from API |

## User Stories

1. **As a user**, I can see my tasks for today in a grid layout with completion status
2. **As a user**, I can see my weekly tasks aggregated across all days of the week
3. **As a user**, I can identify which tasks have been started, completed, or ignored
4. **As a user**, I can navigate between dates to view past task completions
5. **As a user**, I can see collaborator information on shared task lists
6. **As a user**, I can track job entries linked to my tasks
7. **As a user**, I can add ephemeral (one-off) tasks that aren't part of a template
8. **As a user**, existing legacy tasks are automatically migrated to the new task system

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/tasks?listId=&date=` | GET | Fetch tasks with date-specific completion data |
| `/api/v1/jobs?listId=&date=` | GET | Fetch jobs (auto-refresh every 60s) |
| `/api/v1/profiles/by-ids?ids=` | GET | Fetch collaborator profiles |
| `/api/v1/tasklists` | POST | Create ephemeral tasks |
| `/api/v1/tasks/migrate` | POST | Migrate legacy tasks to Task collection |

## Loading States

- **Initializing** (`isInitializingTaskLists`): Shows "Setting up your tasks..." spinner
- **Date change** (`isLoadingTasksForDate`): Shows loading spinner for task re-fetch
- **Initial load** (`!initialLoadDone`): Shows skeleton grid of 8 placeholder cards
