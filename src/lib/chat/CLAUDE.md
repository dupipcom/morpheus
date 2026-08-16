# Chat Lib

Server/client chat library for org channels, direct messages, and SMS conversations: auth/role checks, message/thread CRUD and queries, invite handling, unread tracking, Ably-based realtime publishing, and the unread-chat email notification cron. Imported by every `/api/v1/chat/*` route, the SMS service, and the Chat UI.

## Files

| File | Purpose |
|---|---|
| `api.ts` | Shared route helpers: JSON errors, slugify, Ably publish wrappers, org member lookup |
| `auth.ts` | Chat user resolution (Clerk), role checks, org-membership/channel/DM access guards, `getClerkOrganizations` |
| `constants.ts` | `CHAT_POLL_INTERVAL_MS` (30s), deleted/anonymous message markers, base URL helper |
| `invites.ts` | Invite state/expiry validation (`isChatInviteActive`), ObjectId guard, invite URL builder |
| `messages.ts` | Thread-state resolution, `createChatMessage`, message preview extraction |
| `permissions.ts` | Role model + guards: `canManageChannels`, `canManageInvites`, `canAssignRoles`, `canModerateMessages`, `canDeleteMessage` |
| `queries.ts` | Prisma read queries: `listChannelMessages`, `listDmMessages`, `getThread`, `getUnreadCount`, `getSmsUnreadCount`, `getChatSidebar` |
| `routes.ts` | `buildChatRoomPath` — locale-aware chat room URLs (channel/DM targets) |
| `types.ts` | Shared types: `ChatRoleValue`, `ChatRoomTypeValue`, `ChatMessageSummary`, `ChatUserProfile`, `ChatRoomUnreadSummary`, `ClerkOrgSummary` |
| `unread.ts` | `getRoomKey` — canonical unread-room key (channelId or dmConversationId) |
| `unreadChatEmailNotifications.ts` | Nodemailer unread-chat digest: batching, dedupe keys, re-notification policy, HTML/text builders; entry point `processUnreadChatEmailNotifications()` + `isAuthorizedCronRequest` |
| `realtime/ablyClient.ts` | Client Ably.Realtime singleton, token via POST `/api/v1/chat/token` |
| `realtime/ablyServer.ts` | Server Ably.Rest client, `createAblyTokenRequest`, `publishAblyEvent` |
| `realtime/channelNames.ts` | Channel-name builders: `chat:user:*`, `chat:org:*:channel:*`, `chat:dm:*`, `chat:org:*:meta`, `chat:sms:*` |
| `realtime/events.ts` | `CHAT_EVENTS` — 14 event names (`message.created`, `room.read`, `invite.created`, `sms.message.created`, …) + `ChatEventName` type |

## Key Exports

| Export | Purpose |
|---|---|
| `getOrCreateChatUser`, `getCurrentChatUser`, `requireCurrentChatUser`, `getUserChatRole`, `ensureChannelAccess`, `ensureDmParticipant`, `canStartDirectMessage` | Auth/authorization for chat API routes |
| `canManageChannels`, `canModerateMessages`, `canDeleteMessage` | Role-based capability checks (`ChatRoleValue` = SUPERUSER/ADMIN/MODERATOR/USER) |
| `createChatMessage`, `getMessagePreview`, `resolveThreadState` | Message/thread write path |
| `listChannelMessages`, `getThread`, `getUnreadCount`, `getSmsUnreadCount`, `getChatSidebar` | Read queries used by sidebar/unread endpoints |
| `buildChatInviteUrl`, `isChatInviteActive` | Invite lifecycle |
| `publishMessageCreated`, `publishMessageDeleted`, `publishChannelMutation` | Ably publish helpers |
| `getAblyRealtimeClient` / `getAblyServerClient`, `createAblyTokenRequest`, `publishAblyEvent` | Realtime transport |
| `getChatUserChannelName`, `getChatOrgChannelName`, `getChatDmChannelName`, `getChatSmsChannelName` | Ably channel naming |
| `CHAT_EVENTS`, `ChatEventName` | Realtime event vocabulary |
| `processUnreadChatEmailNotifications`, `isAuthorizedCronRequest`, `buildUnreadChatEmailHtml/Text/Subject` | Unread email digest cron |
| `getRoomKey` | Room identity for unread state |

## Consumers

- API routes: `app/api/v1/chat/*` (token, sidebar, orgs, invites, channels, messages, threads, dms, read-state, dm-candidates, unread-count)
- SMS: `app/api/v1/sms/conversations*`, `src/lib/services/sms/smsService.ts`, `src/lib/services/sms/webhookHandler.ts`
- Cron: `app/api/cron/unread-chat-emails/route.ts`
- UI: `components/chat/chatNavButton.tsx`, `components/chat/chatSidebar.tsx`, `views/chat/chatView.tsx`

## Tests

`__tests__/` (node:test): `invites`, `permissions`, `routes` (`buildChatRoomPath`), `unread` (`getRoomKey`), `unreadChatEmailNotifications` (batching/dedupe/renotification).

## Cross-References

- `src/views/chat/CLAUDE.md` — chat UI consumers
- `src/lib/services/sms/CLAUDE.md` — SMS service consuming chat queries/publishing
- `src/app/api/v1/CLAUDE.md` — chat API routes
- `src/lib/prisma.ts` — DB access for `queries.ts` / `unreadChatEmailNotifications.ts`
