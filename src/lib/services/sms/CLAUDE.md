# SMS Service

## Purpose

Telnyx SMS conversations and messages powering the premium `virtual_number` feature. Read tracking lives on `SmsConversation.lastReadAt` (ChatReadState is chat-only); every mutation publishes Ably events + user-channel invalidation. Webhook ingress verifies Telnyx signatures (webhook_api_version "2") and dispatches inbound/outbound-status events idempotently (dedup on telnyxMessageId, P2002-safe).

## Files

- `index.ts` — barrel re-exporting types, helpers, verifier, service, handler
- `helpers.ts` — pure, side-effect-free mappers/guards (unit-tested)
- `smsService.ts` — conversation/message CRUD, send, read-tracking
- `types.ts` — DTOs, `SmsErrorCode`, `SmsError` class
- `webhookVerifier.ts` — Ed25519 signature verification, never throws
- `webhookHandler.ts` — `message.received` / `message.sent` / `message.finalized` dispatch
- `__tests__/helpers.test.ts`, `__tests__/webhookVerifier.test.ts`

## Key Exports

| Export | Purpose |
|---|---|
| `listSmsConversations` / `listSmsMessages` | Conversation summaries (last message + unread count) / message pages |
| `sendSmsMessage` | Sanitize, enforce 1600-char max, pick from-number, send via Telnyx, store OUTBOUND |
| `markSmsConversationRead` | Set `lastReadAt` (optionally from a message id) |
| `ensureSmsConversationOwnership` | 404/403 ownership guard used by routes |
| `handleTelnyxWebhook` | Dispatch v2 events; inbound routing + outbound status updates |
| `verifyTelnyxWebhookSignature` | Ed25519 over `"{timestamp}\|{raw body}"`; returns `{ok, reason}`, never throws |
| `mapInboundSmsPayload` / `mapOutboundSmsStatus` / `shouldApplyOutboundStatus` | Payload mapping; terminal-status guard (DELIVERED/FAILED never regress) |
| `SmsError` | Typed error (`code` + message) mapped to HTTP status by routes |

## Consumers

- API: `src/app/api/v1/telnyx/webhook/route.ts` (verify + handle), `src/app/api/v1/sms/conversations/route.ts`, `src/app/api/v1/sms/conversations/[conversationId]/messages/route.ts`, `src/app/api/v1/sms/conversations/[conversationId]/read/route.ts`
- Chat UI (types only): `src/components/chat/smsSidebarCard.tsx`, `src/components/chat/chatSidebar.tsx`, `src/views/chat/chatView.tsx`

## Cross-References

- `src/app/api/v1/telnyx/CLAUDE.md`, `src/app/api/v1/sms/CLAUDE.md`, `src/views/chat/CLAUDE.md`
- `src/lib/services/virtual-number` (telnyxClient)
- `src/lib/services/CLAUDE.md`
