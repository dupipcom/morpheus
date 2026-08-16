# Notifications API

## Routes
- `GET /api/v1/notifications`
- `POST /api/v1/notifications` (mark read)

## Auth
Clerk auth; derives internal `User`.

## GET `/notifications`
Returns the current user's notifications, newest first (last 30), enriched with the actor's public username (`Profile.username`). Also returns the total unread count.

## Response
`{ notifications: [{ id, type, actorId, actorName, resourceId, message, readAt, createdAt }], unreadCount }`

## POST `/notifications` (mark read)
Body: `{ ids?: string[] }` — 24-hex notification ObjectIds. Marks the given notifications as read; when `ids` is omitted, marks all of the user's unread notifications.

## Response
`{ updated: number }` — count of notifications newly marked read.

## Notification types
| type | meaning | resourceId |
|---|---|---|
| `JOB_REQUESTED` | A collaborator requested to work on one of your tasks | job id |
| `JOB_ACCEPTED` | An owner/manager approved a worker's job request | job id |
| `JOB_REJECTED` | An owner/manager declined a worker's job request | job id |
| `LIST_INVITE` | Someone added a user as a list collaborator | list id |

## Notes
- Notification creation is best-effort: writers (`jobs`, `jobs/[jobId]`, `tasklists/[taskListId]`) fire-and-forget with `.catch` logging and never fail the write path.
- Self-notifications are skipped in the service (`actorId === userId`).
- Client-side text is localized via `notifications.types.*` keys (see the i18n key list in `src/components/notificationsButton.tsx`).

## Dependencies
- `src/lib/services/notification` (`notifyUser`, `listNotifications`, `markNotificationsRead`, `unreadCount`)
- Prisma models: `Notification`, `Profile`
