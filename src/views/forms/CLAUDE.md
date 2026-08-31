# Forms - Task & List Creation Forms

## Purpose

Minimal forms for creating and editing tasks and task lists (rebuilt in the Do rebuild, #441 follow-up). The template form and budget distribution inputs were removed.

## Files

| File | Purpose |
|------|---------|
| `addTaskForm.tsx` | Create/edit tasks: name, cadence (CadencePicker, RRULE), counter (times), premium (fiat or % of list budget) |
| `addListForm.tsx` | Create/edit lists: name, visibility, collaborators, budget (fiat or % of budget sources), delete |
| `addEventForm.tsx` | Create event drafts: profile fields, visibility, owner (Me/org), cover/flier images (create-flow contract), returns the created event via `onCreated(event)` |
| `manageEventForm.tsx` | Manage an event: edit profile + cover/flier, Save (PUT), Publish (POST), Delete/Cancel (DELETE); opened automatically on a new draft and from Mine/Org cards |

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
| `/api/v1/events` | POST | addEventForm (create draft) |
| `/api/v1/events/{id}` | PUT/DELETE | addEventForm (link media after create), manageEventForm (save/delete) |
| `/api/v1/events/{id}/publish` | POST | manageEventForm (publish) |
| `/api/v1/attachments` | POST | both event forms (commit cover/flier uploads, `entityType: 'event'`) |
| `/api/v1/orgs` | GET | addEventForm (owner selector) |

## Notes

- **Event create-flow contract**: cover/flier uploads in `addEventForm` run with `entityId=null`; after the event is created the form commits each pending descriptor via `commitAttachmentToEntity` (exported by `attachmentPicker.tsx`) and links the ids onto the event with a PUT. Failures only break the image, never the event.
- **Manage dialog media**: `manageEventForm` seeds existing cover/flier as done picker items (rendered via `attachmentFileUrl`) and commits new uploads directly against `event.id`.
- **List cover + project creation**: `addListForm` follows the same cover contract for lists (seed existing cover via `attachmentFileUrl`, commit new uploads after the list exists). Its project selector supports inline creation: type `@handle`, availability is checked against the shared `/@` namespace via `GET /api/v1/projects/available`, and `POST /api/v1/projects { name, username }` creates the project (auto-selected on success).

## User Stories
1. **As a user**, I can create tasks with a Google-Calendar-like cadence and a completion counter
2. **As a user**, I can create lists with collaborators and a budget (fiat or % of my budgets)
3. **As a user**, I can edit and delete my lists
