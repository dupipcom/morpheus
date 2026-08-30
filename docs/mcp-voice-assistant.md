# Dupip MCP Server + Telnyx Voice Assistant — Runbook (Phase 12)

Plan of record: `docs/plans/phase-12-mcp-voice-assistant.md`. This runbook covers
deployment, configuration, and the demo script.

## Architecture

```
Caller ─PSTN─▶ Telnyx AI Assistant (conversation_flow)
                 │ (a) assistant.initialization (signed)
                 ▼
   dupip-mcp-edge (Telnyx Edge Function)  → KV caller cache + CallSession actor
                 │ POST /api/v1/mcp/edge/phone-auth (x-mcp-edge-secret, <2.5s)
                 ▼
   morpheus /api/mcp (Streamable HTTP MCP server)
      ├─ phone_auth_by_callerid / phone_query_user_data / phone_record_message
      ├─ true caller from _meta.telnyx_conversation_id → GET /v2/ai/conversations/{id}
      ├─ web_auth (Clerk OIDC) for web MCP clients
      └─ Voicemail rows + iDrive e2 audio + Ably + Notification
                 │ (c) call.recording.saved (Ed25519)
                 ▼
   POST /api/v1/telnyx/webhook → attach recording → /app/chat/voicemails
```

## Environment variables (morpheus — `.env.local`)

| Variable | Purpose |
|---|---|
| `MCP_SERVICE_KEY` | Static bearer the Telnyx assistant uses to call `/api/mcp` |
| `MCP_PUBLIC_ORIGIN` | Canonical MCP origin (RFC 8707 `resource`, redirect base), e.g. `https://www.dupip.com` |
| `MCP_CLERK_OAUTH_CLIENT_ID` / `MCP_CLERK_OAUTH_CLIENT_SECRET` | Clerk OAuth application (web_auth) |
| `MCP_CLERK_OAUTH_ISSUER` | Clerk instance issuer, e.g. `https://<instance>.clerk.accounts.dev` |
| `MCP_EDGE_SECRET` | Secret the edge function sends to `/api/v1/mcp/edge/phone-auth` (defaults to `INTERNAL_FETCH_SECRET`) |
| `TELNYX_INFERENCE_MODEL` / `TELNYX_STT_MODEL` | Telnyx Inference models for summaries / STT (fallbacks: DeepSeek, `openai/whisper-large-v3-turbo`) |

## One-time setup

### 1. Clerk

1. Create an **OAuth application** in the Clerk dashboard (client type:
   application, grant: authorization code + PKCE/S256).
2. Redirect URL: `https://www.dupip.com/api/mcp/oauth/callback` (and
   `http://localhost:3000/api/mcp/oauth/callback` for dev). Loopback
   redirects are allowed for desktop MCP clients (RFC 8252).
3. Copy client id/secret/issuer into the env vars above.
4. **Phone verification** (caller-ID lookup): enable phone number
   verification on the instance (currently not activated). Until then, only
   Telnyx virtual-number owners are recognized as callers; everyone else is
   routed to voicemail.

### 2. Telnyx

```bash
telnyx-edge auth api-key set
cd edge/dupip-mcp-edge
telnyx-edge new-func dupip-mcp-edge -l ts   # first time — writes func_id
# create the KV namespace (wait for status "provision_ok") and set its id in func.toml:
#   POST https://api.telnyx.com/v2/storage/kvs  {"name":"dupip-mcp-edge-cache"}
telnyx-edge secrets add MORPHEUS_BASE_URL
telnyx-edge secrets add MORPHEUS_EDGE_SECRET
telnyx-edge secrets add TELNYX_WEBHOOK_PUBLIC_KEY
telnyx-edge ship                              # → https://dupip-mcp-edge-<id>.telnyxcompute.com
```

### 3. Assistant

1. Register the MCP server:
   `POST /v2/ai/mcp_servers` with `{name, type, url: "https://www.dupip.com/api/mcp", api_key_ref, allowed_tools: [phone_auth_by_callerid, phone_query_user_data, phone_record_message]}`.
2. Create the assistant with the workflow: adapt
   `edge/dupip-mcp-edge/assistant-config.json` (fill `dynamic_variables_webhook_url`
   and `mcp_servers[0].id`) and `POST /v2/ai/assistants` (or use the Portal
   assistant builder).
3. Bind a phone number: create a connection with
   `webhook_api_url: https://api.telnyx.com/v2/ai/assistants/{assistant_id}/answer`
   and `PATCH /v2/phone_numbers/{id}` with `connection_id`. Alternatively use
   the Portal's "assign a number" wizard.

### 4. Verify locally

```bash
npm run dev
# metadata + 401 discovery
curl -s localhost:3000/api/mcp/.well-known/oauth-protected-resource
curl -s -i -X POST localhost:3000/api/mcp -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'  # expect 401 + WWW-Authenticate
# authed initialize + tools (needs MCP_SERVICE_KEY in .env.local)
curl -s -X POST localhost:3000/api/mcp -H "Authorization: Bearer $MCP_SERVICE_KEY" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"dev","version":"0"}}}'
# or point the MCP Inspector at http://localhost:3000/api/mcp
npx @modelcontextprotocol/inspector
```

## Demo script (8–10 min)

1. **Setup**: show `edge/dupip-mcp-edge` + `telnyx-edge ship` in Mission
   Control; show KV namespace + actor instance after a call.
2. **Known-caller query**: call the demo number from a phone whose number is
   registered (virtual number or Clerk-verified). Greeting names the caller
   (`{{caller_full_name}}`, `{{call_count}}` from the actor). Ask "how was
   Sam's week?" — the assistant calls `phone_query_user_data`
   (watch the conversation transcript show the tool call), answers from real
   data at the caller's access level.
3. **Access levels**: same question from a number with no relationship → the
   answer is built from PUBLIC days/notes/profile only; mention it out loud.
   Delegated caller (doctor/tutor) → richer answer per delegation scopes.
4. **Voicemail path**: call from an unknown number (or a caller who asks to
   leave a message) → voicemail node → hang up. Open `/app/chat/voicemails`
   on the recipient's account: play the audio, read transcript + summary,
   unread badge clears. Show `call.recording.saved` attaching the recording.
5. **Dynamic webhook**: show the `assistant.initialization` request and the
   `dynamic_variables` response (caller identity, access level, call count,
   KV feature flag `voicemail_flow_enabled`).
6. **web_auth (browser clients)**: open the MCP Inspector against
   `https://www.dupip.com/api/mcp`, call `web_auth`, complete the Clerk
   redirect, then use `phone_auth_by_callerid`/`phone_query_user_data` with
   the resulting token.
7. **Walkthrough**: why Actor vs KV vs plain logic (caller session RMW is
   actor-shaped; identity cache + flags are KV; everything else stateless in
   morpheus), why LLM vs expression edges (`caller_known` is deterministic →
   expression; intent classification is fuzzy → LLM), and the OpenCode +
   Telnyx Inference dev loop used to build this.

## Operational notes

- **Edge failure mode**: morpheus unreachable → `caller_known: false` → the
  call is routed to voicemail-only (never dropped).
- **Recording expiry**: Telnyx recording download URLs are valid ~10 min —
  `call.recording.saved` must be processed promptly (the webhook handler
  downloads immediately).
- **Cold starts**: `/api/mcp` sessions are per-instance; a stale
  `Mcp-Session-Id` returns 404 and clients re-initialize (MCP spec behavior).
- **GDPR**: voicemail DELETE removes the S3 object first; transcripts and
  audio are PII — no PII in logs, owner-only access.

## Telnyx doc references

- [Conversation Workflows](https://developers.telnyx.com/docs/inference/ai-assistants/workflows)
- [Dynamic Variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables)
- [Create Assistant](https://developers.telnyx.com/api-reference/assistants/create-an-assistant) ·
  [Create MCP Server](https://developers.telnyx.com/api-reference/mcp-servers/create-mcp-server)
- [Edge Functions](https://developers.telnyx.com/docs/edge-compute/quickstart) ·
  [Bindings](https://developers.telnyx.com/docs/edge-compute/runtime/bindings) ·
  [KV](https://developers.telnyx.com/docs/edge-compute/kv) ·
  [Stateful Actors](https://developers.telnyx.com/docs/edge-compute/stateful-actors)
- [Recordings](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/record) ·
  [AI Conversations](https://developers.telnyx.com/api-reference/conversations/get-a-conversation)
- [MCP spec](https://modelcontextprotocol.io/specification/2025-06-18)
