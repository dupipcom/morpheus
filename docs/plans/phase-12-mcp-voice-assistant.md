# Phase 12 — Dupip MCP Server + Telnyx Voice Assistant (Telnyx Edge Compute Challenge)

## Context

Dupip (morpheus) users keep their lives in the app — days, moods, tasks, notes, and AI hint analyses. The vision: **a phone number users can give to friends, so anyone can call and asynchronously catch up** — ask "how was Sam's week?", get an answer grounded in Sam's actual data (at the access level the caller is entitled to), or leave a voicemail that lands in the recipient's `/app/chat` as playable audio + transcript + summary.

This doubles as the **Telnyx Edge Compute Coding Challenge** submission: an AI Assistant with a multi-node Conversation Workflow, a custom MCP server with 4 tools, a Dynamic-Variables webhook served by a Telnyx Edge Function (KV + Stateful Actor), deployed publicly and documented.

### The 4 MCP tools (fixed requirements)
1. `web_auth` — MCP session auth via Clerk redirects (OIDC); supports Telnyx Edge Functions as auth-initiator.
2. `phone_auth_by_callerid` — authenticate the caller by their number (VirtualNumber owners or Clerk-verified phones), verified against the *actual* call, not the LLM's word.
3. `phone_query_user_data` — NL query about a target user; access ladder: owner / explicit delegation (per scopes) / otherwise public notes + public profile only.
4. `phone_record_message` — store voicemail audio (iDrive e2) + transcription + summary, viewable in `/app/chat`.

### Decisions locked with the user
- **MCP server lives inside morpheus** as a Next.js route handler (publicly reachable; no new infra).
- **Voicemail audio → existing iDrive e2 bucket** (reuse `src/lib/storage/s3.ts`; media policy gains an `audio` kind).
- **Caller-ID lookup**: Telnyx `VirtualNumber.phoneNumber` owners, else **Clerk-verified phone numbers** (enable phone verification on the Clerk instance — currently not activated; no schema field added in this round).
- **`web_auth` uses Clerk as OIDC provider** (user request): OAuth app (auth code + PKCE), thin RFC 8414/9728 metadata layer served by morpheus, MCP server validates Clerk-issued JWTs as the OAuth resource server.
- **AI for voicemail**: Telnyx Inference (`POST /v2/ai/chat/completions`, OpenAI-compatible) + `POST /v2/ai/audio/transcriptions` for STT, DeepSeek as fallback (existing `src/lib/deepseek.ts`).

---

## Architecture

```
Caller phone ─PSTN─▶ Telnyx AI Assistant (conversation_flow)
                       │  (a) assistant.initialization (signed)
                       ▼
           dupip-mcp-edge  (Telnyx Edge Function, TS)
              ├─ KV: caller/1555… cache (TTL 600), flags/<name>
              ├─ Actor CALL_SESSION.idFromName(e164).recordCall()  (RMW)
              └─ POST morpheus /api/v1/mcp/edge/phone-auth  (<1s, secret header)
                       │
                       ▼  (b) MCP tool calls (Bearer MCP_SERVICE_KEY)
           morpheus /api/mcp  (Streamable HTTP MCP server)
              ├─ phone_auth_by_callerid / phone_query_user_data / phone_record_message
              ├─ TRUE caller resolved from _meta.telnyx_conversation_id
              │     → GET /v2/ai/conversations/{id} → metadata.telnyx_end_user_target
              ├─ web_auth: OAuth resource server (Clerk OIDC) for web MCP clients
              └─ writes: Voicemail rows, iDrive e2 audio, Ably, Notification
                       │
                       ▼  (c) call.recording.saved (Ed25519-verified)
           POST /api/v1/telnyx/webhook → voicemailService.attachRecording()
                       │
                       ▼
           /app/chat "Voicemails" room (transcript + <audio> player, Ably unread, email digest)
```

### Flow A — web_auth (MCP OAuth 2.1 per spec 2025-06-18)
MCP client hits `/api/mcp` unauthenticated → 401 + `WWW-Authenticate: Bearer resource_metadata=…` → reads `/.well-known/oauth-protected-resource` (RFC 9728) → `/.well-known/oauth-authorization-server` (RFC 8414, thin proxy advertising Clerk's endpoints) → `web_auth` tool returns an `authorization_url` → `/api/mcp/oauth/authorize` (PKCE S256 + state) → 302 to Clerk OAuth app → user signs in → code → `/api/mcp/oauth/token` (proxies Clerk token endpoint) → client sends `Authorization: Bearer <clerk-access-token>` on every request; morpheus validates via Clerk JWKS + audience = MCP OAuth client id, maps `sub` (Clerk user id) → internal `User.id`. Edge-as-auth-initiator: the edge function (or the `/api/v1/mcp/edge/phone-auth` endpoint) can initiate a phone-session auth context / request an authorization URL; browser completion applies to web clients; SMS-link pairing (caller receives a link → logs in via Clerk → verified phone binds) is the async-catch-up stretch (documented, not required for demo).

### Flow B — phone auth + query
`assistant.initialization` → edge function: verify signature → KV `caller/1555…` cache hit, else call morpheus phone-auth endpoint → caller identity + access level + target-user (owner of `telnyx_agent_target`) → cache 10 min → actor RMW → return `dynamic_variables`. Mid-call, `phone_query_user_data` ignores LLM-supplied identity and re-derives the caller from `_meta.telnyx_conversation_id` via the conversations API; runs the shared query pipeline (access ladder → RAG → generation).

### Flow C — voicemail
`phone_record_message` creates a `Voicemail` row (caller phone/name, target user, transcript/summary, optional audioKey), publishes Ably `voicemail.created` + user invalidation + in-app Notification; chat sidebar shows a Voicemails room; unread-email cron includes voicemails.

### Flow D — recording webhook
`call.recording.saved` → existing `POST /api/v1/telnyx/webhook` (same Ed25519 + 5-min window; new dispatch branch) → match `Voicemail` by `callSessionId`/`callControlId` → download MP3 from Telnyx `download_urls` (valid ~10 min) → `putObject` to iDrive e2 → update row + Ably. No match → create a degraded voicemail from the recording alone.

---

## Part A — morpheus changes

### A1. Prisma schema (`prisma/schema.prisma`)

```prisma
model Voicemail {
  id                    String    @id @default(auto()) @map("_id") @db.ObjectId
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  targetUserId          String    @db.ObjectId
  targetUser            User      @relation("UserVoicemails", fields: [targetUserId], references: [id], onDelete: Cascade)
  callerUserId          String?   @db.ObjectId   // set when caller is a known Dupip user
  callerPhone           String?
  callerName            String?
  callerVerified        Boolean   @default(false) // STIR/SHAKEN A attestation

  audioKey              String?
  audioMimeType         String?
  audioDurationSec      Int?
  transcript            String?
  summary               String?
  source                String    @default("AI_ASSISTANT")  // AI_ASSISTANT | RECORDING

  telnyxConversationId  String?   @unique   // idempotent re-delivery (P2002 pattern, webhookHandler.ts:90-94)
  callSessionId         String?
  callControlId         String?
  readAt                DateTime?

  @@index([targetUserId, createdAt])
  @@index([callSessionId])
  @@index([callControlId])
}
```
Plus on `User`: `voicemails Voicemail[] @relation("UserVoicemails")`. Apply with `npx prisma db push` (MongoDB, no migration files). Follow schema conventions in `.claude/rules/04-database.md`.

### A2. Storage (`src/lib/storage/s3.ts`)
- `VALID_KINDS` + `AttachmentKind` gain `'audio'`; `EXTENSIONS_BY_KIND.audio = ['mp3','wav','m4a','ogg']`; `MIME_BY_EXTENSION` gains `mp3: audio/mpeg, wav: audio/wav, m4a: audio/x-m4a, ogg: audio/ogg`; `KIND_CAPS.audio = 25MB`; add `audio` branch to `kindFamilyMatches` (line 240-244 — default currently maps to PDF only).
- New server-side helpers: `putObject(key, body, contentType, contentLength?)` (PutObjectCommand) and `objectKeyForVoicemail(targetUserId, ext)` → `vm/{userId}/{yyyy}/{mm}/{uuid}.{ext}` (mirror `objectKeyForUpload`, s3.ts:168-173).

### A3. MCP endpoint + OAuth (new files)
| File | Purpose |
|---|---|
| `src/app/api/mcp/route.ts` | Streamable HTTP: POST (JSON-RPC → JSON or SSE), GET (SSE for existing session), DELETE (terminate). Origin validation; `MCP-Protocol-Version` echo; 401 + `WWW-Authenticate`; `export const maxDuration = 120`. |
| `src/lib/services/mcp/server.ts` | `McpServer` from `@modelcontextprotocol/sdk` registering the 4 tools. |
| `src/lib/services/mcp/transport.ts` | Next.js adapter: in-memory `Map<sessionId, {transport, server, identity}>` + **stateless fallback** (fresh transport + replay) for Vercel cold starts; 10-min TTL GC. |
| `src/lib/services/mcp/auth.ts` | Request → `{kind:'service-key'}` (constant-time compare `MCP_SERVICE_KEY`) | `{kind:'oauth', clerkUserId}` (`@clerk/backend` `verifyToken` + audience check) | `{kind:'anonymous'}`. |
| `src/lib/services/mcp/callerIdentity.ts` | `getTrueCaller(_meta)`: cache `_meta.telnyx_conversation_id` lookups in a 60s TTL Map; else `GET /v2/ai/conversations/{id}` → `metadata.telnyx_end_user_target` (+ `telnyx_end_user_target_verified`). **Never trust LLM-supplied numbers.** |
| `src/lib/services/mcp/tools.ts` | The 4 tool handlers (schemas below). |
| `src/lib/services/mcp/telnyxClient.ts` | Extend hand-rolled v2 client pattern (`virtual-number/telnyxClient.ts`): `getConversation(id)`, `getConversationMessages(id)`, `listRecordings({callSessionId, callControlId})`, `getRecording(id)`. |
| `src/app/api/mcp/oauth/authorize|callback|token/route.ts` | PKCE start (state cookie) → 302 Clerk; state-validated callback → client redirect; token proxy to Clerk (authorization_code + refresh; no client-credentials grant — Clerk doesn't support it yet). |
| `src/app/.well-known/oauth-protected-resource/route.ts` + `src/app/.well-known/oauth-authorization-server/route.ts` | RFC 9728 + RFC 8414 metadata (verify App Router handles dot-segments; else add `next.config.ts` rewrites). |

Add deps: `@modelcontextprotocol/sdk`, `@clerk/backend` (explicit — don't rely on the transitive copy).

### A4. Tool schemas (registered on the MCP server)

**`web_auth`** — input: `{redirect_uri?: string, resource?: string}` → output: `{authorization_url, expires_at}`. Initiates the Clerk-redirect OIDC flow for the MCP client session; edge functions may call it as auth-initiator.

**`phone_auth_by_callerid`** — input: `{phone_number: string, conversation_id?: string}` → output: `{caller_known, identity?: {user_id, name, username, avatar_url}, access_level: OWNER|DELEGATE|FRIEND|CLOSE_FRIEND|PUBLIC|UNKNOWN, relationship, verified}`. Authoritative caller = `_meta.telnyx_conversation_id` → conversations API (input number only used as fallback when no `_meta`). Lookup order: `prisma.virtualNumber.findUnique({phoneNumber})` → owner; else `clerkClient.users.getUserList({phoneNumber:[phone]})` (verified only) → internal user.

**`phone_query_user_data`** — input: `{target_user: string, query: string, timeframe?: "last_week" | "last_month" | "last_quarter" | "last_year" | "all_time", locale?: string}` → output: `{answer, access_level, caller_verified}`. `timeframe` is **inferred by the LLM from the question** ("how was his week?" → `last_week`); the pipeline maps it to `[startDate, endDate]` (end = today UTC; `all_time` clamped to `MAX_RANGE_DAYS = 730`; default `last_year`), validated with the same whitelist style as `validateAndClampFilterContext` (`validation.ts:53-95`). The resolved date window is included in the generation prompt so answers are time-aware. Target resolution: (1) owner of the called VirtualNumber (`telnyx_agent_target`), (2) unique match of `target_user` by @username → email → phone → name. Access ladder (below) re-validated on every call, mirroring `resolveAgentContext` (`src/lib/services/agent/validation.ts:102-163`).

**`phone_record_message`** — input: `{target_user: string, text?: string, voice_file_url?: string, duration_secs?: number, conversation_id?, call_control_id?, call_session_id?}` (anyOf text/voice_file_url) → output: `{voicemail_id, status: saved|pending_transcription, transcript?, summary?}`. Downloads `voice_file_url` → `putObject` under `vm/{targetUserId}/…`; transcript from text or Telnyx STT; summary via Telnyx Inference (DeepSeek fallback); publishes Ably + Notification.

### A5. Shared query pipeline — `src/lib/services/agent/queryUserData.ts`
Reuse (verified present): `getAllowedDayVisibilities` (validation.ts:25-42), `resolveNoteVisibilityFilter` (`visibility/noteAccess.ts`), `fetchCompactDays`/`fetchCompactNotes`/`buildRagForQuery` (rag.ts:37-125), `buildDaySelectForDimensions`/`buildDayWhere`. New logic only: **phone access ladder**:
1. caller === target → full (existing behavior; RAG surfaces `aiEnabled`/`AI_ENABLED` notes per rag.ts:59-77);
2. `Delegation` (`delegatorId_delegatedId`, same as hint/route.ts:189-197) → full or restricted per scopes (`resolveDelegationVisibilityAccess` semantics, hint/route.ts:70-100);
3. **no delegation — strangers AND friends without delegation → PUBLIC only**: days `PUBLIC`, notes `PUBLIC`, plus public profile fields (`filterProfileFields`/`isFieldVisible`, `utils/profileUtils.ts:354-423`).

**Privacy invariant (enforced in `queryUserData.ts`, covered by negative tests):**
- Notes with `visibility = AI_ENABLED` (legacy) or `aiEnabled = true` at non-PUBLIC visibility are fetched **only when** (a) the caller is the owner, or (b) an explicit `Delegation` grants `AI_ENABLED`/`PRIVATE` scopes (per the `noteAccess.ts` mapping, PRIVATE includes legacy AI_ENABLED). A delegation with only `FRIENDS`/`PUBLIC` scopes must never surface AI_ENABLED-flagged content.
- The PUBLIC tier uses a **fetch variant with `requireAiOptIn: false`**: filter `visibility ∈ [PUBLIC]` and ignore the aiEnabled flag entirely — public notes remain answerable, while AI-enabled private/restricted notes can never leak into a stranger/friend answer. (`fetchCompactNotes` gains an options param; its two existing consumers — hint route and assistant chat — keep the current `requireAiOptIn: true` behavior, so `rag.ts` semantics elsewhere are untouched.)
- Days in the PUBLIC tier use `getAllowedDayVisibilities('PUBLIC') = ['PUBLIC']`; `analysis`/`productivity` are never selected (recursion guard, `agent/CLAUDE.md`).
Window: last 365 days clamped to `MAX_RANGE_DAYS = 730`. Generation: Telnyx Inference chat completions, DeepSeek fallback; ~250-word spoken-style answer; `userChunkTopK: 8, docChunkTopK: 2` for latency. Add `buildPhoneQuerySystemPrompt` to `agent/prompt.ts`.

### A6. Voicemail service + API + UI
- Service `src/lib/services/voicemail/voicemailService.ts` (+ `types.ts`, `index.ts`, `transcription.ts`, `recordingHandler.ts`): create/list/markRead/delete/attachRecording; `sanitizeText` on all user text; Ably `voicemail.created|updated` via `CHAT_EVENTS` (`src/lib/chat/realtime/events.ts` — add events; channel `chat:voicemail:{userId}` via `channelNames.ts`), `publishUserInvalidation`, in-app `notifyUser` (new type `VOICEMAIL`).
- Routes: `GET /api/v1/voicemails` (+unreadCount), `PATCH|DELETE /api/v1/voicemails/[id]` (owner; delete removes S3 object first — attachments pattern), `GET /api/v1/voicemails/[id]/audio` (owner-only Range stream, `audio/mpeg`, nosniff — modeled on `attachments/[documentId]/file`). Standard route pattern from `.claude/rules/02-backend.md`; add per-resource CLAUDE.md docs.
- UI: `src/components/chat/voicemailSidebarCard.tsx` (mirror `smsSidebarCard.tsx`), `voicemailPlayer.tsx` (`<audio controls>` + transcript + summary, mark-read on play), `src/app/[locale]/app/chat/voicemails/page.tsx`; extend `chatView.tsx` room union (`'voicemails'`), SWR fetch, Ably subscription; fold voicemail unread into `getUnreadCount` (`src/lib/chat/queries.ts`); **i18n keys** `chat.voicemail.*` in `src/locales/en.json` (+ fallbacks; never hardcode text, `.claude/rules/03-frontend.md`).
- Email digest: add voicemail section to `src/lib/chat/unreadChatEmailNotifications.ts` (new code — no SMS section exists today), `EmailNotification.scopeKey = 'voicemail:{id}'` (dedup via existing `@@unique([recipientUserId, scopeKey])`); same `/api/cron/unread-chat-emails` entrypoint.

### A7. Telnyx webhook extension
`src/lib/services/sms/webhookHandler.ts` line 33-38: add `event_type === 'call.recording.saved'` → `handleRecordingSaved(payload)` (recordingHandler.ts). Route + Ed25519 verification unchanged. P2002-safe idempotency (pattern at webhookHandler.ts:90-94).

### A8. Env (`src/app/api` config + `.env.public`)
`MCP_SERVICE_KEY=`, `MCP_CLERK_OAUTH_CLIENT_ID=`, `MCP_CLERK_OAUTH_CLIENT_SECRET=`, `MCP_PUBLIC_ORIGIN=`, `MCP_EDGE_SECRET=` (defaults `INTERNAL_FETCH_SECRET`), `TELNYX_INFERENCE_MODEL=`, `TELNYX_STT_MODEL=`. Secrets in `.env.local` per `.claude/rules/05-security-compliance.md`.

---

## Part B — Telnyx Edge: `edge/dupip-mcp-edge/` (new, in-repo)

**`telnyx.toml`** (exact shape per `telnyx-edge new-func` scaffold; actors live in the telnyx.toml umbrella — [bindings docs](https://developers.telnyx.com/docs/edge-compute/runtime/bindings)):
```toml
name = "dupip-mcp-edge"
main = "src/index.ts"

[telnyx]                          # pre-auth SDK + TELNYX_API_KEY env
[storage.kv.CALLER_CACHE]         # id = "<kv-namespace-uuid>" (console/API)
[[secrets]]                       # MORPHEUS_BASE_URL, MORPHEUS_EDGE_SECRET, TELNYX_WEBHOOK_PUBLIC_KEY
[[actors]]
binding = "CALL_SESSION"
type = "DupipCallSession"
[[ratelimits]]
# fixed window ~120 req/60s on dynamic_variables
```

**`src/index.ts`** handler:
1. Verify Telnyx signature (port `webhookVerifier.ts` logic — Ed25519 over `"{timestamp}|{raw body}"`, 5-min window).
2. `event_type === 'assistant.initialization'` → extract `telnyx_end_user_target`, `telnyx_end_user_target_verified`, `telnyx_agent_target`, `call_control_id`, `telnyx_conversation_id`.
3. KV get `caller/{e164-digits}` (**normalize: strip `+`; KV key charset excludes `+` and `:`**). Miss → `POST {MORPHEUS_BASE_URL}/api/v1/mcp/edge/phone-auth` (`x-mcp-edge-secret`, `AbortSignal.timeout(2500)`); cache `expirationTtl: 600`.
4. `await env.CALL_SESSION.idFromName(e164).recordCall({callerKnown})` → `{callCount, lastIntent, lastCallAt}` (single-threaded RMW via `this.ctx.storage.get/put`).
5. Read `flags/<name>` from KV (e.g. `flags/voicemail_flow_enabled`).
6. Respond (all values strings for `{{var}}` interpolation):
```json
{ "dynamic_variables": { "caller_known": "true", "caller_full_name": "Jordan",
    "caller_access_level": "FRIEND", "caller_relationship": "friend",
    "caller_verified": "true", "call_count": "3", "target_user_name": "Sam",
    "voicemail_flow_enabled": "true" },
  "memory": { "conversation_query": "Sam's week" } }
```
Budget: total webhook time well under `dynamic_variables_webhook_timeout_ms` (set 5000; platform max 10000, default 1500 — [dynamic variables docs](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables)). Deploy `telnyx-edge ship` → `https://dupip-mcp-edge-<id>.telnyxcompute.com`.

**Actor** (`DupipCallSession`): `recordCall()` read-modify-write on per-caller `state` (callCount, lastCallAt, lastIntent) — the single-threaded, durable-before-reply guarantee makes it race-free ([Stateful Actors docs](https://developers.telnyx.com/docs/edge-compute/stateful-actors)). Stretch: `alarm()` for a "call Sam back?" follow-up reminder (re-arm inside handler; alarms are at-least-once with ~3 retries).

**Morpheus edge endpoint**: `POST /api/v1/mcp/edge/phone-auth` — `{phone, verified, agentTarget}` → `{caller: {known, userId?, name?, username?, accessLevel, relationship, verified}, targetUser?: {userId, name, username}}`. Pure DB lookups (VirtualNumber, Clerk phone search, target owner, relationship), **must answer <1s**, no AI calls, no PII logs.

---

## Part C — AI Assistant: workflow + agent instructions

### C1. Node/edge table (`conversation_flow` on `POST /v2/ai/assistants`)

| Node | Type | Config |
|---|---|---|
| `n_greeting` | `speak` | Verbatim (compliance + disclosure): "Hi, you've reached {{target_user_name}}'s personal assistant. I'm an AI assistant, and this call may be recorded. You can ask me about their life, week, or year — or leave them a message." |
| `n_router` | `prompt` | `instructions_mode: "replace"`, **no tools**. Classify intent; last line exactly `DECISION: QUERY` / `VOICEMAIL` / `GOODBYE`. |
| `n_query` | `prompt` | Tools: `[phone_query_user_data]` only. Instructions below. |
| `n_voicemail` | `prompt` | Tools: `[phone_record_message]` only. Instructions below. |
| `n_confirm` | `speak` | "Got it — saved for {{target_user_name}}. Anything else?" |
| `n_goodbye` | `speak` | "Thanks for calling — take care." |

| Edge | From → To | Condition |
|---|---|---|
| e1 | greeting → router | `{type:"default"}` (speak node: exactly one outgoing edge) |
| e2 | router → voicemail | `{type:"expression"}` `caller_known == "false"` (variable-comparison edge — challenge item) |
| e3 | router → voicemail | `{type:"llm"}` "Does the caller want to leave a message (or was intent unclear)? yes/no" |
| e4 | router → query | `{type:"llm"}` "Is the caller asking a question about the user's life/week/year/mood/tasks/notes? yes/no" |
| e5 | router → goodbye | `{type:"llm"}` "Is the caller ending the call? yes/no" |
| e6 | router → query | `{type:"default"}` catch-all for known callers |
| e7 | query → router | `{type:"default"}` follow-up loop |
| e8 | voicemail → confirm | `{type:"default"}` |
| e9 | confirm → goodbye | `{type:"default"}` |

Stretch: `telnyx_conversation_duration_secs >= 300` expression edge as loop guard; secondary "voicemail-only" assistant for `caller_known == "false"` (multi-assistant routing).

Assistant config: `dynamic_variables_webhook_url` = edge URL, `dynamic_variables_webhook_timeout_ms: 5000`, `mcp_servers: [{id: <dupip-mcp>, allowed_tools: [phone_auth_by_callerid, phone_query_user_data, phone_record_message]}]` (web_auth is browser-only). Register MCP server via `POST /v2/ai/mcp_servers {name, type, url, api_key_ref, allowed_tools}`; phone number bound via connection `webhook_api_url: https://api.telnyx.com/v2/ai/assistants/{id}/answer` + PATCH `connection_id`.

### C2. Improved agent instructions (replaces the WIP prompt)

**n_query instructions (`instructions_mode: "append"`):**
```
You are the personal assistant of {{target_user_name}}, a Dupip user. You answer
questions from a phone caller about {{target_user_name}}'s life, week, month,
year, mood, tasks, habits, and notes.

STRICT SCOPE DISCIPLINE
- Answer ONLY from data returned by phone_query_user_data for the caller's
  access level. If access_level is PUBLIC or the tool returns nothing, say what
  you can see and never imply access to private data.
- Never fabricate moods, tasks, notes, dates, or analysis. If there is no data
  for the question, say "I don't have information about that."
- Summarize; never recite note text verbatim at length.
- Never discuss the tools, access levels, or that other data exists.

TONE AND FORM
- Warm, concise, conversational — under 120 words per answer, plain spoken
  sentences, no lists or markdown.
- The caller is {{caller_full_name}} (access: {{caller_access_level}},
  relationship: {{caller_relationship}}). Address them naturally.
- If caller_known is "false" you are in voicemail mode: do not query; offer to
  take a message.

TOOL USE
- Call phone_query_user_data once per distinct question, passing the real
  question as query and the person's name as target_user.
- Infer the timeframe from the question and pass it ("how was his week?" →
  last_week; "how has her year been?" → last_year; "how is he doing lately?" →
  last_month). Default to last_year when unclear.
- Ask one clarifying question before repeating a failed or empty lookup.
- If the tool errors or times out, apologize and offer to leave a message.
```

**n_voicemail instructions:**
```
You are taking a recorded message for {{target_user_name}} on their Dupip voicemail.
- Warmly ask the caller to speak their message: "Go ahead — {{target_user_name}}
  will see this message and can read or listen to it."
- If the caller asks questions instead, remind them this is the message
  recorder, then take their message.
- After they finish, call phone_record_message once with the message text as
  `text` and {{target_user_name}}'s name as `target_user`.
- Then say: "Got it — saved for {{target_user_name}}. Anything else?" and end
  the call when they are done.
- If the tool fails, say the message could not be saved and suggest trying
  again later.
```

---

## Part D — Setup steps (outside code)

1. **Clerk instance**: create OAuth application (authorization code + PKCE; loopback redirect for local dev + `https://www.dupip.com` production); enable **phone number verification** (user confirmation: currently not activated); note OAuth availability depends on plan — verify at M2.
2. **Telnyx**: `telnyx-edge auth api-key set`; create KV namespace (`POST /v2/storage/kvs`, wait `provision_ok`); create MCP server + assistant (API or Portal); assign/patch phone number → connection; confirm the assistant-initialization webhook signature scheme in Mission Control during M5.
3. **Vercel env**: all A8 vars in production + nightly.

---

## Milestones (≈1 week)

- **M1 Foundations**: deps; s3.ts audio kind + `putObject` + `objectKeyForVoicemail`; Prisma `Voicemail` + `db push`. *Verify: `prisma generate`, build passes, node script PUTs/GETs an MP3 with Range.*
- **M2 MCP + OAuth**: `/api/mcp` route + transport + server; auth.ts; well-known + oauth routes; Clerk OAuth app. *Verify: `@modelcontextprotocol/inspector` connects, completes web_auth flow, lists 4 tools; unauthenticated → 401 + WWW-Authenticate; service-key path works; foreign Origin rejected.*
- **M3 Tools + query pipeline**: `queryUserData.ts`, `callerIdentity.ts`, tools.ts, edge phone-auth endpoint. *Verify: curl tool tests — VirtualNumber owner resolves; stranger AND non-delegated friend get PUBLIC-only scope; delegation case matches `GET /api/v1/hint`; LLM-supplied phone ignored when `_meta` present (mocked conversations API); timeframe mapping (last_week/last_month/last_quarter/last_year/all_time → correct window, all_time clamps to 730 days); <25s latency. **Privacy negative tests**: seeded private + AI_ENABLED + aiEnabled@FRIENDS notes never appear in stranger/friend answers; a FRIENDS-scope-only delegation never surfaces AI_ENABLED notes; a delegation with AI_ENABLED/PRIVATE scopes does; public notes appear in the public tier regardless of aiEnabled.*
- **M4 Voicemail store + UI**: service, routes, transcription/summary, sidebar card + room + player, Ably/unread/notification, email digest, Playwright `e2e/voicemails.spec.ts`. *Verify: tool call creates row + S3 object + Ably event; UI renders audio + transcript; unread badge live; cron dry-run includes voicemails; e2e green.*
- **M5 Edge + assistant E2E**: edge function (KV + actor + signature), assistant + workflow + MCP registration + number binding; OpenCode with `@telnyx/opencode` used throughout dev (dogfood note for demo). *Verify: `telnyx-edge ship`; dynamic webhook returns correct vars for known/unknown caller; real calls: known caller query path, stranger → voicemail path.*
- **M6 Recording webhook + hardening**: `call.recording.saved` attach; rate limits (edge `[[ratelimits]]` + `/api/mcp` middleware); audience-check regression; PII log audit. *Verify: recording attaches to the right voicemail without refresh; webhook replay is a no-op; degraded path works.*
- **M7 Docs + demo**: `docs/mcp-voice-assistant.md` (runbook, env table, URLs, rollback), README section, demo script, full regression (`npm run build`, `npm run lint`, e2e). *Verify: demo script executed on production; challenge checklist §Compliance all green.*

## Compliance checklist (challenge)
1. Multi-node workflow + LLM & variable-comparison edges — C1 (speak nodes e1/e8/e9; expression e2; LLM e3-e5). 2. MCP ≥3 tools called mid-conversation — query + voicemail (+auth at init). 3. Dynamic webhook variables via Edge Function — Part B. 4. Edge Compute: Edge Function + KV (caller cache, flags) + Stateful Actor (RMW per caller) — Part B. 5. Telnyx Inference via OpenCode — dev workflow M5 + runtime STT/summary. 6. Public deployment + docs — M7. Stretch: recording storage (iDrive e2, per user choice), KV flags, actor alarm, multi-assistant routing, duration-escalation edge.

## Security & compliance (repo rules 05)
- Caller spoofing: identity only from `_meta`/conversations API; STIR/SHAKEN `telnyx_end_user_target_verified` flags unverified IDs; assistant must disclose verification state.
- MCP spec: Origin validation (DNS rebinding), audience check on Clerk JWTs, no token passthrough, 401/403 semantics.
- Voice webhooks: Ed25519 + 5-min window (existing verifier); edge function verifies `assistant.initialization`.
- Data: `sanitizeText` on transcript/summary/name; owner-only voicemail routes; audio via authenticated Range stream (nosniff); DELETE removes S3 object; no PII in logs; generic error responses.

## Risks / open questions
1. **Tool-call latency** vs Telnyx timeouts — mitigate with 365-day window, lower top-K, DeepSeek for speed; measure at M5.
2. **Recording↔voicemail association** depends on `callSessionId`/`callControlId` reaching the tool call (`_meta` or `{{call_control_id}}`); fallback: conversations metadata or degraded voicemail — validate M6 with a real call.
3. **Dynamic-webhook signature scheme** for `assistant.initialization` — confirm in Mission Control at M5; Ed25519 primary.
4. **Clerk OAuth app + phone verification availability** on the current Clerk plan — verify M2; without phone verification only VirtualNumber owners resolve (strangers → voicemail/public).
5. **Vercel cold starts vs MCP sessions** — stateless fallback for tool calls; SSE GET may force re-init (documented).
6. **Telnyx AI entitlements** (conversations API, mcp_servers, inference) must be enabled on the account — verify M3.
7. **GDPR retention** for voicemail audio/transcripts — product decision; DELETE route supports erasure; flag for follow-up.

## Telnyx doc references (validation basis)
- Workflows: https://developers.telnyx.com/docs/inference/ai-assistants/workflows
- Dynamic variables: https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables
- Create assistant / create MCP server API: https://developers.telnyx.com/api-reference/assistants/create-an-assistant · https://developers.telnyx.com/api-reference/mcp-servers/create-mcp-server
- Edge functions/bindings/limits/CLI: https://developers.telnyx.com/docs/edge-compute/quickstart · /runtime/bindings · /platform/limits · /reference/cli · /telnyx-api
- KV: https://developers.telnyx.com/docs/edge-compute/kv (+ /kv/quick-start)
- Stateful Actors: https://developers.telnyx.com/docs/edge-compute/stateful-actors (+ /concepts/how-it-works, /shared-actors, /alarms)
- Recordings + conversations: https://developers.telnyx.com/api-reference/recordings · https://developers.telnyx.com/api-reference/conversations/get-a-conversation
- MCP spec (transports/authz): https://modelcontextprotocol.io/specification/2025-06-18/basic/transports · …/basic/authorization
