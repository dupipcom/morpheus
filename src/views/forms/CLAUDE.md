# Forms - Task & List Creation Forms

## Purpose

Minimal forms for creating and editing tasks and task lists (rebuilt in the Do rebuild, #441 follow-up). The template form and budget distribution inputs were removed.

## Files

| File | Purpose |
|------|---------|
| `addTaskForm.tsx` | Create/edit tasks: name, cadence (CadencePicker, RRULE), counter (times), premium (fiat or % of list budget) |
| `addListForm.tsx` | Create/edit lists: name, visibility, collaborators, budget (fiat or % of budget sources), delete |

## Common Patterns
- Dialogs controlled via `open` / `onOpenChange` (shadcn Dialog)
- Single write path per form (`POST/PUT /api/v1/tasks`, `POST/PUT/DELETE /api/v1/tasklists/[id]`)
- Collaborator suggestions via `useFriendProfiles` (SWR, local filtering)
- Budget sources via `GET/POST /api/v1/budgets`

## API Endpoints

| Endpoint | Method | Used By |
|---|---|---|
| `/api/v1/tasks` | POST | addTaskForm (create) |
| `/api/v1/tasks/{id}` | PUT | addTaskForm (edit) |
| `/api/v1/tasklists` | POST | addListForm (create) |
| `/api/v1/tasklists/{id}` | PUT/DELETE | addListForm (edit/delete) |
| `/api/v1/budgets` | GET/POST | addListForm (budget sources) |
| `/api/v1/profiles` | GET | addListForm (collaborator search) |

## User Stories
1. **As a user**, I can create tasks with a Google-Calendar-like cadence and a completion counter
2. **As a user**, I can create lists with collaborators and a budget (fiat or % of my budgets)
3. **As a user**, I can edit and delete my lists
