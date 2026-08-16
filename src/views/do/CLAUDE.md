# DoView - Task Management View

## Purpose

The DoView is the task management hub. It orchestrates task/list creation forms and delegates rendering to the TaskGrid. Rebuilt during the Do rebuild (#441 follow-up): plain SWR data fetching, no legacy completedTasks merging, no auto-migration.

## Files

- `doView.tsx` — orchestrator: SWR tasks-for-date + jobs, collaborator profiles, forms, TaskGrid
- `doPage.tsx` — shared client page (list selection, date URL param, redirect logic); used by both `/app/do` and `/app/do/[listId]` routes

## Data Flow

```
DoPage ── DoToolbar (useTaskLists, ?date= URL param, plus menu)
       └─ DoView
          ├─ AddListForm / AddTaskForm dialogs
          └─ TaskGrid ← SWR /api/v1/tasks?date&listId
               ├─ TaskItem (tap = POST /api/v1/jobs; counter; status menu)
               └─ JobDialog (request+justification / submit evidence / review)
```

## State Management
- `useTaskLists` — SWR `/api/v1/tasklists` (replaces GlobalContext taskLists + 30s polling)
- `useUserData` — internal user id + refresh
- SWR tasks/jobs with 60s jobs refresh

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/tasks?listId=&date=` | GET | Date-aware tasks (RRULE) |
| `/api/v1/jobs?listId=&date=` | GET | Jobs for the grid |
| `/api/v1/jobs` | POST | Complete/request tasks |
| `/api/v1/jobs/{id}` | PUT | Status transitions, evidence, reviews |
| `/api/v1/tasks/{id}` | PUT/DELETE | Edit / scoped delete |
| `/api/v1/tasklists` | GET/POST | Lists |
| `/api/v1/tasklists/{id}` | GET/PUT/DELETE | List detail/update/delete |
| `/api/v1/profiles/by-ids` | GET | Collaborator names |

## User Stories
1. **As a user**, I can see my tasks for any date with completion status and counters
2. **As a collaborator**, I can request work on a task with a justification, and submit evidence for review
3. **As an owner/manager**, I can accept, request changes, or reject submitted work
4. **As a user**, I can delete tasks for today only, from today onwards, or entirely
