# Telnyx Webhook API

Inbound Telnyx messaging webhook (webhook_api_version "2"). Receives `message.received` (inbound SMS), `message.sent`, and `message.finalized` (outbound delivery status) events and stores them as `SmsMessage` rows.

## Route

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/telnyx/webhook` | Telnyx messaging webhook → `{ ok: true }` |

## Auth (Ed25519, no Clerk)

Intentionally unauthenticated by Clerk — this endpoint is called server-to-server by Telnyx. Requests are verified by:

- **Signature**: `telnyx-signature-ed25519` header (base64) over `"{telnyx-timestamp}|{raw body}"`, verified with the account Ed25519 public key (`TELNYX_WEBHOOK_PUBLIC_KEY` env — Mission Control → Account Settings → Keys & Credentials → Public Key; Telnyx provides the raw 32-byte key as base64, e.g. `eu2zvPjhY6odxV34Z/...=`; a PEM key is also accepted for local testing).
- **Replay protection**: `telnyx-timestamp` (unix seconds) must be within ±5 minutes.

## Behavior

- Always answers 2xx quickly (Telnyx retries on failure; delivery budget ~2 s). Unexpected handler errors return 500 so Telnyx retries — dedup on `telnyxMessageId` makes retries idempotent.
- Unknown events and numbers not assigned to a user are a no-op (200).
- Media-only MMS stores empty text; media URLs are not stored (follow-up).

## Errors

| Status | Meaning |
|---|---|
| 200 | Processed (or intentionally ignored) |
| 400 | Body is not valid JSON |
| 401 | Missing/invalid signature or expired timestamp |
| 500 | Unexpected handler error (Telnyx will retry) |

## Dependencies

- `src/lib/services/sms` (webhookHandler, webhookVerifier)
- Prisma models: `SmsConversation`, `SmsMessage`, `VirtualNumber`
- Env: `TELNYX_WEBHOOK_PUBLIC_KEY`
