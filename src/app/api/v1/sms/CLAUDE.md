# SMS API

Telnyx SMS conversations for the premium `virtual_number` feature. Conversations are 1:1 between a user and a counterpart phone number; inbound messages arrive via the Telnyx webhook (`telnyx/CLAUDE.md`) and are published to Ably for realtime delivery.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/sms/conversations` | List the user's SMS conversations (`{ conversations: [...] }`) |
| GET | `/api/v1/sms/conversations/{conversationId}/messages?limit=` | List messages (newest last, limit clamped 1–100) |
| POST | `/api/v1/sms/conversations/{conversationId}/messages` | Send an SMS (`{ content }`) → `{ messageId }` (201) |
| POST | `/api/v1/sms/conversations/{conversationId}/read` | Mark read (`{ lastReadMessageId? }`) → `{ ok: true }` |

## Auth

- Clerk auth via `getCurrentChatUser()`. Ownership of the conversation is verified on every route.
- No server entitlement check on these routes (client gating via `useFeatureFlag` parity); sending requires an assigned `VirtualNumber`.

## From-Number Resolution (multi-number users)

Users can hold several virtual numbers (plan quota 1/3/5). Outbound SMS from-number resolution in `sendSmsMessage`:

1. `SmsConversation.virtualNumberId` — the number that received the inbound that opened the conversation (set by `webhookHandler`).
2. Fallback: the user's first assigned number (oldest), lazily backfilled into `virtualNumberId`.
3. Otherwise 409 `NO_VIRTUAL_NUMBER`.

## Errors

| Status | Meaning |
|---|---|
| 400 | Message content required / exceeds 1600 characters |
| 401 | Unauthenticated |
| 403 | Conversation belongs to another user |
| 404 | Conversation not found |
| 409 | No virtual number assigned (cannot send) |
| 502 | Telnyx send failed |

## Realtime

- `sms.message.created` / `sms.message.updated` on `chat:sms:{conversationId}` (see `src/lib/chat/realtime/channelNames.ts`), plus `room.unread.changed` on the owner's user channel. Capabilities granted in `POST /api/v1/chat/token`.

## Dependencies

- `src/lib/services/sms` (smsService, webhookHandler, helpers, webhookVerifier)
- `src/lib/services/virtual-number/telnyxClient` (`sendTelnyxMessage`)
- Prisma models: `SmsConversation`, `SmsMessage`, `VirtualNumber`
- Env: `TELNYX_API_KEY`
