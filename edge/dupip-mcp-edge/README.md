# dupip-mcp-edge — Telnyx Edge Function (Dupip phase 12)

Dynamic-variables webhook for the Dupip AI Assistant. Resolves the caller
identity (KV-cached, backed by morpheus `/api/v1/mcp/edge/phone-auth`), records
the call in a per-caller Stateful Actor, and returns `dynamic_variables` for
the assistant's Conversation Workflow.

**Live URL**: `https://dupip-mcp-edge-afd30602-9.telnyxcompute.com`
(func_id `afd30602-9319-45f9-9538-e4d5624ff7f1`, shipped with
`telnyx-edge` v0.5.1 on 2026-08-30).

## Manifest layout (CLI v0.5.1)

Single umbrella `telnyx.toml` — `ship` reads the function identity and all
bindings from it (`func.toml` is not used):

```toml
name = "dupip-mcp-edge"
main = "src/index.ts"
compatibility_date = "2026-08-30"

[edge_compute]
func_id = "afd30602-9319-45f9-9538-e4d5624ff7f1"
func_name = "dupip-mcp-edge"

[telnyx]                        # pre-auth Telnyx SDK → env.TELNYX
binding = "TELNYX"

[storage.kv.CALLER_CACHE]       # env.CALLER_CACHE (KvNamespace)
id = "f2692a8f-c3f9-499f-8722-f78fbcdf8196"

[[secrets]]                     # env.SECRETS.get(binding)
binding = "MORPHEUS_BASE_URL"
name = "MORPHEUS_BASE_URL"

[[ratelimits]]                  # env.DYNAMIC_VARIABLES (RateLimiter)
name = "dynamic_variables"
limit = 120
period = 60

[[actors]]                      # env.CALL_SESSION (ActorNamespace<DupipCallSession>)
binding = "CALL_SESSION"
type = "DupipCallSession"
```

Run `telnyx-edge types` after manifest changes to regenerate `telnyx-env.d.ts`.

## Setup / redeploy

```bash
telnyx-edge auth api-key set <key>
telnyx-edge bindings create          # once per org (already created)
cd edge/dupip-mcp-edge
telnyx-edge secrets add MORPHEUS_BASE_URL "https://www.dupip.com"
telnyx-edge secrets add MORPHEUS_EDGE_SECRET "<secret>"        # = MCP_EDGE_SECRET / INTERNAL_FETCH_SECRET in morpheus
telnyx-edge secrets add TELNYX_WEBHOOK_PUBLIC_KEY "<ed25519>"  # Mission Control → Keys & Credentials → Public Key
telnyx-edge ship                    # ~4-5 min, monitors the rollout
telnyx-edge logs dupip-mcp-edge --since 1h
```

Set the assistant's `dynamic_variables_webhook_url` to the live URL and
`dynamic_variables_webhook_timeout_ms` to `5000`.

## Behavior

- **Signature**: Telnyx Ed25519 over `"{timestamp}|{raw body}"`, ±5 min window
  (same scheme as morpheus `POST /api/v1/telnyx/webhook`). Missing/unknown
  events → 200 no-op; missing secret → 500 (visible in logs).
- **KV** `caller/{e164-digits}` → identity JSON, TTL 600s (keeps calls inside
  the webhook budget). `flags/voicemail_flow_enabled` → "true"/"false" feature
  flag read per call (no redeploy to toggle the voicemail flow).
- **Actor** `DupipCallSession` per caller number: single-threaded
  read-modify-write of `{callCount, lastCallAt, lastIntent}`.
- **Failure mode**: if morpheus is unreachable the call proceeds with
  `caller_known: false` → the workflow routes to voicemail-only.

## Dynamic variables returned

| Variable | Meaning |
|---|---|
| `caller_known` | "true"/"false" — drives the expression edge to the voicemail branch |
| `caller_full_name` / `caller_username` | greeting personalization |
| `caller_access_level` | OWNER / DELEGATE / PUBLIC / UNKNOWN |
| `caller_relationship` | self / delegate / friend / close_friend / stranger / none |
| `caller_verified` | STIR/SHAKEN attestation ("true"/"false") |
| `call_count` | per-caller call count from the actor |
| `target_user_name` | owner of the dialed number (greeting: "Sam's personal assistant") |
| `voicemail_flow_enabled` | KV feature flag |

Docs: [bindings](https://developers.telnyx.com/docs/edge-compute/runtime/bindings) ·
[KV](https://developers.telnyx.com/docs/edge-compute/kv) ·
[Stateful Actors](https://developers.telnyx.com/docs/edge-compute/stateful-actors) ·
[dynamic variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables)
