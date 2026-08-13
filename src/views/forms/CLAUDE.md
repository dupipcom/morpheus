# Forms - Task, List & Template Creation Forms

## Purpose

This directory contains form components for creating and editing tasks, task lists, and templates. All forms integrate with the `useOptimisticUpdates` hook for immediate UI feedback and use SWR for data fetching.

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `addTaskForm.tsx` | 324 | Create new tasks within a task list |
| `addListForm.tsx` | 952 | Create/edit task lists with budget, cadence, collaborators |
| `addTemplateForm.tsx` | 212 | Create task templates from existing lists |

## Common Patterns
- All forms use `useOptimisticUpdates` for pending task tracking
- `mutateRefs` pattern for triggering parent revalidation after create
- Controlled open/close via props (`open`, `onOpenChange`)
- All forms receive task list context via props (not GlobalContext directly)
- Category, area, cadence selects follow the application's enum patterns

## API Endpoints

| Endpoint | Method | Used By | Why / How |
|---|---|---|---|
| `/api/v1/tasklists` | POST | `addTaskForm.tsx`, `addListForm.tsx` | Create/update task lists; `addTaskForm` posts tasks through the tasklist operation handler, `addListForm` posts list create/edit (including delete). |
| `/api/v1/tasks` | POST | `addTaskForm.tsx` | Create a new task in the Task collection when not going through the legacy tasklist path. |
| `/api/v1/tasks/{id}` | PUT | `addTaskForm.tsx` | Edit an existing task's fields. |
| `/api/v1/tasks?listId=` | GET | `addListForm.tsx` | Load the current tasks of a list being edited. |
| `/api/v1/profiles/by-ids?ids=` | GET | `addListForm.tsx` | Resolve collaborator profiles by user IDs for the collaborator selector. |
| `/api/v1/templates` | POST | `addTemplateForm.tsx` | Create a reusable task template. |

Integration details:
- `addListForm.tsx` posts `create: true` / `create: false` / `deleteTaskList` bodies to the multiplexed `/api/v1/tasklists` handler and expects `{ taskList }` back.
- `addTaskForm.tsx` uses optimistic updates and falls back between `/api/v1/tasks` (Task collection) and `/api/v1/tasklists` (legacy embedded-task operation) depending on the edit path.
- `addTemplateForm.tsx` posts `{ name, tasks, visibility }` to `/api/v1/templates`.

## User Stories
1. **As a user**, I can create new tasks with name, category, area
2. **As a user**, I can create task lists with budget, cadence, and collaborators
3. **As a user**, I can edit existing task lists
4. **As a user**, I can create templates from my task lists for reuse
