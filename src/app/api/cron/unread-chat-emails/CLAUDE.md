# Cron: Unread Chat Emails

## Route
`GET /api/cron/unread-chat-emails`

## Purpose
Hourly cron endpoint that fans out email notifications for users with unread chat messages.

## Auth
Authorized via `isAuthorizedCronRequest(request)` in `src/lib/chat/unreadChatEmailNotifications.ts` (verifies a cron-specific secret/header).

## Behavior
Calls `processUnreadChatEmailNotifications()` which scans for eligible unread-chat recipients and sends emails. Uses `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `revalidate = 0`, and `maxDuration = 300`.

## Response
- `200`: fan-out result payload.
- `401`: `{ error: 'Unauthorized' }`.
- `500`: `{ error: 'Internal server error' }`.

## Dependencies
- `src/lib/chat/unreadChatEmailNotifications.ts`
- `EmailNotification` Prisma model
