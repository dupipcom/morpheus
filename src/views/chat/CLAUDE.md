# ChatView - Real-time Messaging View

## Purpose

The ChatView is a full-featured real-time messaging interface with organization channels, direct messages, threaded replies, and invite management. It uses Ably for real-time message delivery and SWR for data fetching, supporting a three-panel layout (sidebar, room, thread) with mobile-responsive views.

## File: `chatView.tsx`

## Component Architecture

```
ChatView (three-panel layout)
├── Sidebar Panel
│   ├── Pending Invites Card
│   ├── Organization Switcher (icon buttons)
│   ├── Direct Messages
│   │   ├── DM search/creation input
│   │   └── DM conversation list
│   ├── Active Organization Card
│   │   ├── Channel creation (admin/superuser)
│   │   ├── Invite link generation (admin/superuser)
│   │   ├── Member invite input (admin/superuser)
│   │   └── Channel list
│   ├── Organization Creation Card
│   ├── SMS Card (premium, Telnyx conversations with unread badges)
│   ├── Virtual Number Gate Card (non-premium, buy CTA → pricing page)
│   └── Virtual Number Card (premium, `virtual_number` feature flag)
├── Room Panel (messages)
│   ├── Room header (back buttons on mobile)
│   ├── Message list
│   └── ChatComposer
└── Thread Panel (conditional)
    ├── Thread header
    ├── Threaded replies
    └── ChatComposer (reply in thread)
```

## State Management

### Data Fetching (SWR)
- **Sidebar**: `useSWR(/api/v1/chat/sidebar)` with `refreshInterval`
- **Messages**: `useSWR(/api/v1/chat/channels|dms/{id}/messages)` - conditional on activeRoom
- **Thread**: `useSWR(/api/v1/chat/messages/{id}/thread)` - conditional on selectedThreadId
- **DM Candidates**: `useSWR(/api/v1/chat/dm-candidates?q=)` - conditional on query >= 2 chars
- **Member Invite Candidates**: Same pattern as DM candidates

### Real-time Updates (Ably)
Subscribes to Ably channels for real-time message delivery:
- `getChatUserChannelName(userId)` - user-level events
- `getChatOrgChannelName(orgId, channelId)` - channel messages (when in channel)
- `getChatOrgMetaChannelName(orgId)` - org metadata changes (when in channel)
- `getChatDmChannelName(dmId)` - DM messages (when in DM)

### Props (Deep Linking)
```typescript
{
  initialUsername?: string      // Open DM with this user
  initialMessageId?: string     // Scroll to and open thread for this message
  initialOrgId?: string         // Open specific organization
  initialChannelId?: string     // Open specific channel
}
```

### Navigation & URL Sync
- **DM**: `/chat/{username}[/message/{messageId}]`
- **Channel**: `/chat/org/{orgId}/channel/{channelId}[/message/{messageId}]`
- **SMS**: in-memory only (no deep link yet — follow-up)
- **No room**: `/chat`
- Uses `router.push()` to keep URL in sync with room selection

## Correlations

| Related To | Relationship |
|---|---|
| **Ably client** (`ablyClient`) | Real-time message delivery |
| **ChatComposer** | Message input component |
| **ChatMessageContent** | Message rendering component |
| **ChatUnreadBadge** | Unread count indicators |
| **BeView** | Social features share notion of community/connections |

## User Stories

1. **As a user**, I can create organizations and join existing ones
2. **As a user**, I can create channels within my organizations
3. **As a user**, I can send direct messages to friends
4. **As a user**, I can send messages in organization channels
5. **As a user**, I can reply in message threads
6. **As a user**, I can see real-time message delivery without refreshing
7. **As a user**, I can see unread message counts in sidebar
8. **As a user**, I can create and share invite links for my organization
9. **As a user**, I can invite friends to my organization
10. **As a user**, I can accept pending organization invitations
11. **As a user**, I can soft-delete messages
12. **As a user**, I can deep-link to specific DMs, channels, or messages
13. **As a user**, I can navigate the chat on mobile with tabbed views
14. **As a premium user**, I can associate several Telnyx phone numbers with my account, up to my plan quota (1/3/5)
15. **As a premium user**, I can receive SMS to my virtual number in chat and reply from the chat room

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/chat/sidebar` | GET | Fetch sidebar with orgs, DMs, unread counts, invites |
| `/api/v1/chat/channels/{id}/messages` | GET/POST | Fetch/send channel messages |
| `/api/v1/chat/dms/{id}/messages` | GET/POST | Fetch/send DM messages |
| `/api/v1/chat/messages/{id}/thread` | GET | Fetch message thread replies |
| `/api/v1/chat/dm-candidates?q=` | GET | Search for DM candidates |
| `/api/v1/chat/orgs` | POST | Create organization |
| `/api/v1/chat/orgs/{id}/channels` | POST | Create channel |
| `/api/v1/chat/dms` | POST | Start DM with user |
| `/api/v1/chat/orgs/{id}/invites` | POST | Create org invite |
| `/api/v1/chat/invites/{id}/accept` | POST | Accept org invite |
| `/api/v1/chat/read-state` | POST | Mark messages as read |
| `/api/v1/chat/messages/{id}` | DELETE | Soft-delete message |
| `/api/v1/virtual-number` | GET/POST | Fetch/assign the user's Telnyx virtual numbers, bounded by plan quota (premium) |
| `/api/v1/virtual-number?phoneNumber=` | DELETE | Unassign one virtual number (premium) |
| `/api/v1/virtual-number/numbers` | GET | List available Telnyx numbers (premium) |
| `/api/v1/sms/conversations` | GET | List SMS conversations (premium) |
| `/api/v1/sms/conversations/{id}/messages` | GET/POST | List/send SMS messages |
| `/api/v1/sms/conversations/{id}/read` | POST | Mark SMS conversation read |

## Loading States

- **Sidebar loading**: "Loading chat..." text
- **Sidebar error**: Error card with error message
- **Messages loading**: "Loading messages..." text
- **Thread loading**: "Loading thread..." text
- **Empty room**: "No messages yet. Start the conversation." card

## Key Behaviors

- **Mobile adaptive**: `sidebar | room | thread` views with hardware back-button friendly navigation
- **Read state tracking**: Automatically marks messages as read when room is opened
- **Deep linking**: Auto-creates DM if deep-linked to a user without existing conversation
- **Message deletion confirmation**: Shows dialog before soft-deleting
- **Anonymous display**: Users without display names show as "Anonymous"
