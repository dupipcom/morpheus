# CLAUDE.md — dupip-mcp-edge

This is a **Telnyx Edge Function** (TypeScript, ESM) deployed with
`telnyx-edge ship`. It is **not** part of the Next.js application and has its
own `package.json` / `node_modules`.

## Purpose

Serves `dynamic_variables` to the Telnyx AI Assistant on every inbound call
via the `assistant.initialization` webhook. Variables drive the greeting,
deterministic routing (`caller_known == "false"` expression edge → public
profile node), and MCP tool calls inside the assistant workflow.

## Key files

| File | Role |
|---|---|
| `src/index.ts` | Main edge function handler — signature verification, KV cache, phone-auth fetch, actor call, flag resolution, variable assembly |
| `src/dupip-call-session.ts` | `DupipCallSession` Stateful Actor — per-caller read-modify-write call counter |
| `telnyx.toml` | Umbrella manifest — function identity, KV namespace, secrets, rate limiter, actor binding |
| `telnyx-env.d.ts` | Generated type declarations for `Env` bindings — **do not edit by hand**; run `telnyx-edge types` to regenerate |
| `assistant-config.json` | Snapshot of the Telnyx AI Assistant configuration (conversation workflow, MCP server allowlist, voice / transcription settings, dynamic variable defaults) |

## Important invariants

- **All `dynamic_variables` values must be strings.** The platform silently
  rejects the entire webhook response if any value is a boolean, number, or
  null. See `buildDynamicVariables()` in `src/index.ts`.
- **Fail-open, never drop a call.** If Morpheus is unreachable or the 9.5-second
  deadline is exhausted, return defaults (`caller_known=false`) so the call
  routes to the voicemail path.
- **KV writes are best-effort.** A KV credential expiry must never downgrade a
  successful `phone-auth` lookup to fail-open. Wrap KV puts in try/catch and
  log, never throw.
- **Stateful Actor is the only correct place for `call_count`.** The
  per-caller read-modify-write races across webhook invocations; the Actor
  (single-threaded per entity) is the right primitive. KV is for caches and
  flags, not counters.

## Runtime bindings (`Env`)

```typescript
CALL_SESSION  // ActorNamespace<DupipCallSession> — per-caller call session
TELNYX        // Pre-authenticated Telnyx SDK instance
CALLER_CACHE  // KvNamespace — caller/target identity cache + feature flags
DYNAMIC_VARIABLES // RateLimiter — 120 req/60 s
SECRETS       // { get(name): Promise<string> } — MORPHEUS_BASE_URL, MORPHEUS_EDGE_SECRET, TELNYX_WEBHOOK_PUBLIC_KEY
```

## Warm-instance caches

Three module-level variables (`cachedPublicKey`, `cachedMorpheus`,
`cachedFlag`) cache values that are expensive to fetch on every cold start.
They survive for the lifetime of the edge instance (~10 min idle timeout).
`cachedFlag` additionally has a 30-second TTL enforced in code.

## Webhook signature verification

Ed25519 over `"{timestamp}|{raw body}"`, ±5-minute window. The public key can
be a raw 32-byte base64 string (as Telnyx provides in Mission Control) or a
PEM SPKI key. Both are handled in `importEd25519PublicKey()`.

## Phone-auth flow

On a caller-cache miss the function calls Morpheus
`POST /api/v1/mcp/edge/phone-auth` with `x-mcp-edge-secret` header. The
endpoint returns `{ caller: CallerIdentity, targetUser: TargetUser | null }`.
The timeout is the lesser of the remaining webhook budget and 9 000 ms.

## KV key scheme

| Key | TTL | Content |
|---|---|---|
| `caller/<e164-digits>` | 30 min | `PhoneAuthResponse` JSON |
| `target/<e164-digits>` | 24 h | `TargetUser` JSON |
| `flags/voicemail_flow_enabled` | manual | `"true"` / `"false"` |

## Deployment

```bash
telnyx-edge ship            # build + deploy, monitors rollout
telnyx-edge logs dupip-mcp-edge --since 1h
```

After changing `telnyx.toml` bindings:

```bash
telnyx-edge types           # regenerates telnyx-env.d.ts
```

## Related Morpheus code

- `src/app/api/v1/mcp/edge/phone-auth/route.ts` — the endpoint this function
  calls (requires `x-mcp-edge-secret`)
- `src/app/api/mcp/route.ts` — the MCP server the assistant's tools hit
- `src/lib/services/agent/` — RAG pipeline used by `phone_query_user_data`
