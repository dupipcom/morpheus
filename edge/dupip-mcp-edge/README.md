# dupip-mcp-edge

Telnyx Edge Function that serves dynamic variables to the Dupip Personal
Assistant on every inbound call.

## What it does

On each `assistant.initialization` webhook (Ed25519-signed, ±5-minute window)
the function returns a `dynamic_variables` JSON object that the assistant
workflow uses for the greeting, deterministic routing, and MCP tool calls:

| Variable | Description |
|---|---|
| `caller_known` | `"true"` / `"false"` — whether the caller is a recognised Dupip user |
| `caller_full_name` | Display name of the caller, or `"friend"` for unknown numbers |
| `caller_username` | Dupip username of the caller, or `""` |
| `caller_access_level` | Access ladder level: `OWNER`, `DELEGATE`, `PUBLIC`, `UNKNOWN` |
| `caller_relationship` | Delegation relationship label |
| `caller_verified` | `"true"` / `"false"` — Telnyx verified the caller ID |
| `call_count` | Number of times this caller has called (per-number, durable) |
| `target_user_name` | Display name of the Dupip user who owns the phone number dialled |
| `voicemail_flow_enabled` | KV feature flag — `"true"` / `"false"` |

## Architecture

```
inbound call
  → assistant.initialization (Ed25519-signed POST)
  → Edge Function (this package)
      ├── verify signature
      ├── KV CALLER_CACHE (caller/ 30-min TTL, target/ 24-h TTL)  ← parallel
      ├── cache miss → POST /api/v1/mcp/edge/phone-auth on Morpheus (≤9 s)
      ├── Stateful Actor DupipCallSession (per-caller call counter)
      └── KV flag flags/voicemail_flow_enabled (30-s instance cache)
  → { dynamic_variables: { … } }
```

The function is **fail-open**: if Morpheus is unreachable or the webhook
deadline is exhausted, the call proceeds with `caller_known=false` (voicemail
path) and the 24-hour target cache still resolves the greeting name.

## Bindings (telnyx.toml)

| Binding | Type | Purpose |
|---|---|---|
| `CALL_SESSION` | Stateful Actor | Per-caller `DupipCallSession` (call count RMW) |
| `CALLER_CACHE` | KV | Caller + target identity cache, feature flags |
| `DYNAMIC_VARIABLES` | Rate Limiter | 120 req / 60 s on the webhook endpoint |
| `TELNYX` | Telnyx SDK | Pre-authenticated SDK instance |
| `SECRETS` | Secrets | `MORPHEUS_BASE_URL`, `MORPHEUS_EDGE_SECRET`, `TELNYX_WEBHOOK_PUBLIC_KEY` |

## Setup

```bash
telnyx-edge auth api-key set <key>
cd edge/dupip-mcp-edge
telnyx-edge secrets add MORPHEUS_BASE_URL "https://www.dupip.com"
telnyx-edge secrets add MORPHEUS_EDGE_SECRET "<secret>"          # = MCP_EDGE_SECRET in Morpheus
telnyx-edge secrets add TELNYX_WEBHOOK_PUBLIC_KEY "<ed25519>"    # Mission Control → Keys & Credentials
telnyx-edge ship
telnyx-edge logs dupip-mcp-edge --since 1h
```

## Local development

```bash
npm ci
telnyx-edge types          # regenerate telnyx-env.d.ts after manifest changes
telnyx-edge dev            # local dev server
```

## Docs

- [Edge Functions](https://developers.telnyx.com/docs/edge-compute/quickstart)
- [KV](https://developers.telnyx.com/docs/edge-compute/kv)
- [Stateful Actors](https://developers.telnyx.com/docs/edge-compute/stateful-actors)
- [Bindings](https://developers.telnyx.com/docs/edge-compute/runtime/bindings)
- [Dynamic variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables)
- [Assistants API](https://developers.telnyx.com/api-reference/assistants/create-an-assistant)
