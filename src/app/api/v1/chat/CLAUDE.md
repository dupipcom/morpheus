# Chat API

Real-time messaging backed by Clerk organizations, Prisma chat models, and Ably for delivery. All routes require Clerk auth via `getCurrentChatUser()` unless noted.

## Routes

### Conversation / Agent
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/chat` | Save an agent conversation to today's `Day.analysis.agentConversation` |

### Sidebar & Real-time
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/chat/sidebar` | Fetch sidebar (orgs, DMs, unread counts, invites) |
| GET | `/api/v1/chat/unread-count` | Current user's unread message count |
| POST | `/api/v1/chat/token` | Create an Ably token request with channel capabilities |
| POST | `/api/v1/chat/read-state` | Mark a channel or DM as read |

### Direct Messages
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/chat/dm-candidates?q=` | Search friend/close-friend DM candidates |
| GET | `/api/v1/chat/dms` | List current user DMs |
| POST | `/api/v1/chat/dms` | Create/open a DM (friends/close friends only) |
| GET/POST | `/api/v1/chat/dms/{conversationId}/messages` | List/send DM messages |

### Channels
| Method | Path | Purpose |
|---|---|---|
| PATCH | `/api/v1/chat/channels/{channelId}` | Update channel (name/description/position/type) |
| DELETE | `/api/v1/chat/channels/{channelId}` | Archive channel |
| GET/POST | `/api/v1/chat/channels/{channelId}/messages` | List/send channel messages |

### Messages
| Method | Path | Purpose |
|---|---|---|
| PATCH | `/api/v1/chat/messages/{messageId}` | Edit own message |
| DELETE | `/api/v1/chat/messages/{messageId}` | Soft-delete a message (owner or permitted role) |
| GET | `/api/v1/chat/messages/{messageId}/thread` | Fetch a thread |

### Organizations & Invites
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/chat/orgs` | List current user's organizations |
| POST | `/api/v1/chat/orgs` | Create an organization (+ default `general` channel) |
| GET/POST | `/api/v1/chat/orgs/{orgId}/channels` | List/create org channels |
| GET/POST | `/api/v1/chat/orgs/{orgId}/invites` | List/create org invites |
| POST | `/api/v1/chat/orgs/{orgId}/roles` | Assign chat role (SUPERUSER/ADMIN/MODERATOR/USER) |
| DELETE | `/api/v1/chat/invites/{inviteId}` | Revoke an invite |
| POST | `/api/v1/chat/invites/{inviteId}/accept` | Accept an invite |

## Auth & Permissions
- `getCurrentChatUser()` resolves the internal `User` from the Clerk session.
- `ensureChannelAccess` / `ensureDmParticipant` / `ensureOrgMembership` enforce membership.
- Role gates use `canManageChannels`, `canManageInvites`, `canAssignRoles`, `canDeleteMessage`.

## Realtime
Mutations publish Ably events and invalidate participant sidebar/unread state:
- Channel messages → `getChatOrgChannelName(orgId, channelId)`
- DM messages → `getChatDmChannelName(dmId)`
- Org metadata → `getChatOrgMetaChannelName(orgId)`
- User-level → `getChatUserChannelName(userId)`

## Validation
- Message content required, max 4000 chars.
- Reply/thread root must exist and match.
- Channel/DM names sanitized via `sanitizeText`; slugs generated via `slugifyChatName`.

## Dependencies
- `src/lib/chat/*` (auth, api, queries, messages, permissions, realtime, unread, invites)
- Prisma models: `ChatOrgMembership`, `ChatChannel`, `DirectMessageConversation`, `ChatMessage`, `ChatInviteLink`, `ChatReadState`, `User`
