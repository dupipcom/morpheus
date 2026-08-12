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

## User Stories
1. **As a user**, I can create new tasks with name, category, area
2. **As a user**, I can create task lists with budget, cadence, and collaborators
3. **As a user**, I can edit existing task lists
4. **As a user**, I can create templates from my task lists for reuse
