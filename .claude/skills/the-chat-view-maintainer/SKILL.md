---
name: the-chat-view-maintainer
description: Maintains and enhances the ChatView real-time messaging interface with organizations, channels, DMs, and threads.
license: HPL3-ECO-NC-ND-A 2026
---

Task: Develop, fix, or enhance the ChatView real-time messaging component.

Role: You're a front-end engineer maintaining the real-time chat and messaging features.

## Reference
For detailed documentation on the ChatView's architecture, Ably integration, deep linking, and user stories, read `src/views/chat/CLAUDE.md` first.

## Scope
- `src/views/chat/chatView.tsx` - Main chat container with sidebar/room/thread panels
- `src/components/chat/chatComposer.tsx` - Message input component
- `src/components/chat/chatMessageContent.tsx` - Message rendering with soft-delete support
- `src/components/chat/chatUnreadBadge.tsx` - Unread count indicator
- `src/lib/chat/realtime/ablyClient.ts` - Ably client initialization
- `src/lib/chat/realtime/channelNames.ts` - Channel name generators
- `src/lib/chat/constants.ts` - Chat configuration constants
- `src/lib/chat/invites.ts` - Invite URL builder
- `src/lib/chat/types.ts` - Chat type definitions

## Development Rules
- All SWR keys must be conditional on activeRoom (use `null` to disable fetching)
- Ably subscriptions must be cleaned up on unmount or room change
- Deep link handling uses refs (`deepLinkHandledRef`) to prevent double-processing
- URL navigation must use `navigateToRoom()` for consistent URL structure
- DM auto-creation: if deep-linked to a user without existing DM, search and create
- Anonymous display: use `getDisplayLabel()` with `CHAT_ANONYMOUS_MARKER` fallback
- Mobile uses `mobileView` state with three views: sidebar, room, thread
- Read state is marked automatically when entering a room

## Common Operations
- **Adding a new chat feature**: Follow the organization > channel > message hierarchy
- **Modifying message display**: Update `renderMessage()` and `ChatMessageContent`
- **Adding real-time events**: Subscribe to new Ably channel types in the useEffect
- **Extending permissions**: Check `activeOrg.role` for ADMIN/SUPERUSER gating

## Validation Checklist
- [ ] Organizations, channels, and DMs load correctly in sidebar
- [ ] Messages render with author, timestamp, and reply count
- [ ] Thread opening and replies work
- [ ] Real-time message delivery works (no manual refresh needed)
- [ ] Unread counts update correctly across sidebar
- [ ] Deep links open correct rooms (DMs, channels, threads)
- [ ] Mobile view switching works: sidebar ↔ room ↔ thread
- [ ] Message soft-delete shows placeholder
- [ ] Invite creation and acceptance flow works
- [ ] DM search filters by minimum 2 characters
