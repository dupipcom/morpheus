# DoView - Task Management View

## Purpose

The DoView is the task management hub of the application. It orchestrates the creation of tasks, task lists, and templates, then delegates rendering to the `ListView` component. It serves as the primary interface for users to manage their daily/weekly tasks and track progress.

## File: `doView.tsx`

## Component Architecture

```
DoView
├── AddTaskForm (conditional, from forms/)
├── AddListForm (conditional, from forms/)
├── AddTemplateForm (conditional, from forms/)
└── ListView (from list/)
```

## State Management

### GlobalContext Integration
- Reads `taskLists` and `templates` from `GlobalContext` via `useContext`
- Uses `refreshTaskLists()` and `refreshTemplates()` to trigger re-fetches
- Maintains `stableTaskLists` and `stableTemplates` local state to prevent flashing (never clears once data is loaded)
- Auto-refreshes task lists every 30 seconds via `setInterval`

### Optimistic Updates
- Uses `useOptimisticUpdates()` hook for `pendingTaskCreationsRef` - tracks tasks being created optimistically
- Passes `mutateTasksRef` to `ListView` via `onMutateTasksReady` callback for coordinated mutation after actions

### Props (Controlled Pattern)
```typescript
{
  selectedTaskListId?: string    // Which list is selected
  selectedDate?: Date            // Which date to show tasks for
  onDateChange?: (date: Date | undefined) => void
  onAddEphemeral?: () => Promise<void> | void
  showAddTask?: boolean          // Toggle add task form
  showAddList?: boolean          // Toggle add list form
  showAddTemplate?: boolean      // Toggle add template form
  isEditingList?: boolean        // Edit mode for list
  onCloseAddTask?: () => void
  onCloseAddList?: () => void
  onCloseAddTemplate?: () => void
  onTaskCreated?: () => Promise<void> | void
  onListCreated?: (newListId?: string) => Promise<void> | void
  onTemplateCreated?: () => Promise<void> | void
}
```

## Correlations

| Related To | Relationship |
|---|---|
| **ListView** | Parent component - orchestrates forms, delegates task grid rendering |
| **AddTaskForm** | Modal form for creating new tasks (from forms/) |
| **AddListForm** | Modal form for creating/editing task lists (from forms/) |
| **AddTemplateForm** | Modal form for creating task templates (from forms/) |
| **GlobalContext** | Reads taskLists, templates; calls refresh functions |
| **useOptimisticUpdates** | Tracks pending task creation operations |
| **DashboardView** | Navigated to alongside DoView in the app shell |

## User Stories

1. **As a user**, I can see all my task lists so I can switch between different contexts
2. **As a user**, I can create a new task within a list to track what I need to do
3. **As a user**, I can create a new task list to organize tasks by project or area
4. **As a user**, I can create task templates for recurring task structures
5. **As a user**, I can edit an existing task list to change its name, tasks, or settings
6. **As a user**, I can add ephemeral (one-time, non-template) tasks to a list
7. **As a user**, I can navigate between dates to see past or planned task completion

## API Endpoints

| Endpoint | Method | Used By | Purpose |
|---|---|---|---|
| `/api/v1/tasks?listId=&date=` | GET | ListView (child) | Fetch tasks for a list on a date |
| `/api/v1/jobs?listId=&date=` | GET | ListView (child) | Fetch jobs for task list |
| `/api/v1/profiles/by-ids` | GET | ListView (child) | Fetch collaborator profiles |

## Key Behaviors

- **Stable state pattern**: Once task lists/templates are loaded, they never clear (avoids UI flash during refetches)
- **Controlled/uncontrolled hybrid**: Accepts props for parent control, falls back to internal state
- **30-second polling**: Auto-refreshes task lists periodically to show collaborator changes
