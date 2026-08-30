/**
 * Dupip voice edge function (phase 12) — dynamic-variables webhook for the
 * Telnyx AI assistant.
 *
 * Flow per inbound call:
 *   assistant.initialization (signed) → verify Ed25519 (5-min window)
 *   → KV caller cache (30 min TTL) + KV target cache (24h TTL), in parallel
 *   → caller cache miss: morpheus POST /api/v1/mcp/edge/phone-auth
 *     (deadline-aware budget — the assistant's dynamic_variables_webhook
 *     timeout is 10000 and the call waits for the webhook response, so the
 *     handler uses every millisecond of that window to fetch values and only
 *     falls back gracefully when the deadline is actually reached)
 *   → Stateful Actor recordCall (per-caller RMW, 500ms race)
 *   → KV feature flag (voicemail_flow_enabled, 30s memoized)
 *   → dynamic_variables for the workflow (greeting, routing, tools).
 *
 * Latency notes: edge instances idle-shutdown after ~10 min, so any call can
 * cold-start. Module-level caches (secrets) + the KV caches keep repeat calls
 * well under a second; the 24h target cache keeps {{target_user_name}}
 * resolving on nearly every call even when morpheus is unreachable.
 */

import { DupipCallSession } from './dupip-call-session'

// Re-export the actor class so the platform and `telnyx-edge types` can wire
// the CALL_SESSION binding to the class defined in this project.
export { DupipCallSession }

const SIGNATURE_WINDOW_SECONDS = 300
const CALLER_CACHE_TTL_SECONDS = 1800
const TARGET_CACHE_TTL_SECONDS = 86400
/**
 * The assistant's dynamic_variables_webhook_timeout_ms is 10000. The handler
 * uses the full window to fetch values and only falls back gracefully
 * (200 + defaults, call proceeds without resolved variables) when the
 * deadline is actually reached — never earlier.
 */
const WEBHOOK_DEADLINE_MS = 9500
const PHONE_AUTH_TIMEOUT_MS = 9000
const ACTOR_TIMEOUT_MS = 400
const FLAG_CACHE_TTL_MS = 30_000

/** Minimal binding shapes (the runtime injects the real objects). */
interface KvNamespaceLike {
  get(key: string, options?: { type: 'json' }): Promise<unknown>
  put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>
}

interface ActorNamespaceLike<T> {
  idFromName(name: string): T
}

interface SecretsLike {
  get(name: string): Promise<string>
}

interface Env {
  TELNYX: unknown
  CALLER_CACHE: KvNamespaceLike
  CALL_SESSION: ActorNamespaceLike<DupipCallSession>
  SECRETS: SecretsLike
}

/* ---------------------------------------------------------------------------
 * Warm-instance caches. Secret/flag RPC round-trips cost hundreds of ms on
 * cold instances, so values that change rarely are memoized per instance
 * after the first fetch.
 * ------------------------------------------------------------------------- */

let cachedPublicKey: string | null = null
let cachedMorpheus: { baseUrl: string; secret: string } | null = null
let cachedFlag: { value: boolean; fetchedAt: number } | null = null

async function getPublicKeySecret(env: Env): Promise<string> {
  if (cachedPublicKey !== null) return cachedPublicKey
  cachedPublicKey = await env.SECRETS.get('TELNYX_WEBHOOK_PUBLIC_KEY').catch(() => '')
  return cachedPublicKey
}

async function getMorpheusSecrets(env: Env): Promise<{ baseUrl: string; secret: string }> {
  if (cachedMorpheus) return cachedMorpheus
  const [baseUrl, secret] = await Promise.all([
    env.SECRETS.get('MORPHEUS_BASE_URL'),
    env.SECRETS.get('MORPHEUS_EDGE_SECRET')
  ])
  cachedMorpheus = { baseUrl: baseUrl.replace(/\/+$/, ''), secret }
  return cachedMorpheus
}

async function getVoicemailFlag(env: Env): Promise<boolean> {
  const now = Date.now()
  if (cachedFlag && now - cachedFlag.fetchedAt < FLAG_CACHE_TTL_MS) {
    return cachedFlag.value
  }
  let value = true
  try {
    const flag = await env.CALLER_CACHE.get('flags/voicemail_flow_enabled')
    if (typeof flag === 'string') value = flag === 'true'
  } catch {
    // default on
  }
  cachedFlag = { value, fetchedAt: now }
  return value
}

interface CallerIdentity {
  known: boolean
  userId: string | null
  name: string | null
  username: string | null
  accessLevel: string
  relationship: string
  verified: boolean
}

interface TargetUser {
  userId: string
  name: string | null
  username: string | null
}

interface PhoneAuthResponse {
  caller: CallerIdentity
  targetUser: TargetUser | null
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Accepts the raw 32-byte base64 key Telnyx provides, or a PEM (SPKI) key
 * (the morpheus webhook verifier accepts both — parity of configuration).
 */
async function importEd25519PublicKey(secret: string): Promise<CryptoKey> {
  let raw: Uint8Array
  if (secret.includes('BEGIN PUBLIC KEY')) {
    const body = secret
      .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '')
    raw = base64ToBytes(body)
    // SPKI DER for Ed25519 is 302a300506032b6570032100 + 32-byte key
    if (raw.length === 44) raw = raw.slice(12)
  } else {
    raw = base64ToBytes(secret)
  }
  if (raw.length !== 32) throw new Error('Unexpected Ed25519 public key length')
  return crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify'])
}

/** Telnyx webhook signature: Ed25519 over "{timestamp}|{raw body}", ±5 min. */
async function verifyTelnyxSignature(
  publicKeySecret: string,
  timestamp: string | null,
  rawBody: string,
  signatureBase64: string | null
): Promise<boolean> {
  if (!timestamp || !signatureBase64) return false

  const now = Math.floor(Date.now() / 1000)
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_WINDOW_SECONDS) return false

  try {
    const key = await importEd25519PublicKey(publicKeySecret)
    const data = new TextEncoder().encode(`${timestamp}|${rawBody}`)
    return crypto.subtle.verify({ name: 'Ed25519' }, key, base64ToBytes(signatureBase64), data)
  } catch {
    return false
  }
}

/** E.164 → KV-safe key (KV key charset excludes `+` and `:`). */
function normalizeNumber(number: string): string {
  return number.replace(/^\+/, '').replace(/[^0-9]/g, '')
}

async function resolveCallerContext(
  env: Env,
  phone: string,
  verified: boolean,
  agentTarget: string,
  budgetMs: number
): Promise<PhoneAuthResponse> {
  const { baseUrl, secret } = await getMorpheusSecrets(env)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(budgetMs, PHONE_AUTH_TIMEOUT_MS))
  try {
    const response = await fetch(`${baseUrl}/api/v1/mcp/edge/phone-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-edge-secret': secret
      },
      body: JSON.stringify({ phone, verified, agentTarget }),
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`phone-auth failed: ${response.status}`)
    }
    return (await response.json()) as PhoneAuthResponse
  } finally {
    clearTimeout(timer)
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

/**
 * All values are strings — they interpolate into {{var}} slots in the
 * assistant's instructions, greeting, and expression edge conditions. Only
 * `dynamic_variables` is returned: `memory` and `conversation` are optional,
 * and the platform rejects responses with wrong data types (e.g. boolean
 * metadata) wholesale — which silently discards every variable.
 */
function buildDynamicVariables(
  caller: {
    known: boolean
    name: string | null
    username: string | null
    accessLevel: string
    relationship: string
    verified: boolean
  },
  target: TargetUser | null,
  callCount: number,
  voicemailFlowEnabled: boolean
): Record<string, string> {
  return {
    caller_known: caller.known ? 'true' : 'false',
    caller_full_name: caller.name ?? 'friend',
    caller_username: caller.username ?? '',
    caller_access_level: caller.accessLevel,
    caller_relationship: caller.relationship,
    caller_verified: caller.verified ? 'true' : 'false',
    call_count: String(callCount),
    target_user_name: target?.name ?? target?.username ?? 'the user',
    voicemail_flow_enabled: voicemailFlowEnabled ? 'true' : 'false'
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const startedAt = Date.now()
    // Hard stop: respond with whatever we have (or graceful defaults) before
    // the assistant's 10s webhook window closes. Every stage below budgets
    // against this instead of giving up early.
    const deadlineAt = startedAt + WEBHOOK_DEADLINE_MS
    const remainingMs = () => Math.max(0, deadlineAt - Date.now())

    const rawBody = await request.text()
    const signature =
      request.headers.get('telnyx-signature-ed25519') ?? request.headers.get('webhook-signature')
    const timestamp =
      request.headers.get('telnyx-timestamp') ?? request.headers.get('webhook-timestamp')

    const publicKeySecret = await getPublicKeySecret(env)
    if (!publicKeySecret) {
      console.log('[dupip-mcp-edge] missing public key secret')
      return jsonResponse({ error: 'Missing TELNYX_WEBHOOK_PUBLIC_KEY secret' }, 500)
    }
    if (!(await verifyTelnyxSignature(publicKeySecret, timestamp, rawBody, signature))) {
      console.log('[dupip-mcp-edge] signature verification failed')
      return jsonResponse({ error: 'Invalid signature' }, 401)
    }

    let payload: { data?: { event_type?: string; payload?: Record<string, unknown> } }
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }

    // Telnyx v2 webhook shape: { data: { event_type, payload } } — same
    // envelope as the messaging webhook (webhookHandler.ts reads data.event_type)
    const eventType =
      typeof payload.data?.event_type === 'string' ? payload.data.event_type : null

    if (eventType !== 'assistant.initialization') {
      // NOT short-circuited: every signed request triggers a variables
      // response. Some platform events arrive without data.event_type, and
      // returning ok:true early left those calls without values. Log the
      // event shape (keys only — no PII) and fall through.
      console.log(
        `[dupip-mcp-edge] non-initialization event event_type=${eventType ?? 'unknown'} payload_keys=${JSON.stringify(Object.keys(payload))}`
      )
    } else {
      console.log('[dupip-mcp-edge] assistant.initialization received')
    }

    console.log('[dupip-mcp-edge] assistant.initialization received')

    const data = payload.data?.payload ?? {}
    const callerPhone =
      typeof data.telnyx_end_user_target === 'string' ? data.telnyx_end_user_target : ''
    const verified = data.telnyx_end_user_target_verified === true
    const agentTarget = typeof data.telnyx_agent_target === 'string' ? data.telnyx_agent_target : ''

    // No call context at all (health check / unknown shape): still return a
    // full variables payload with defaults — the platform always gets values.
    if (!callerPhone && !agentTarget) {
      return jsonResponse({
        dynamic_variables: buildDynamicVariables(
          { known: false, name: null, username: null, accessLevel: 'UNKNOWN', relationship: 'none', verified: false },
          null,
          1,
          true
        )
      })
    }

    const callerCacheKey = `caller/${normalizeNumber(callerPhone) || 'unknown'}`
    const targetCacheKey = `target/${normalizeNumber(agentTarget) || 'unknown'}`

    // Both caches in parallel. The caller cache (30 min) covers repeat calls;
    // the target cache (24h) keeps {{target_user_name}} resolving on nearly
    // every call even when morpheus is cold or unreachable.
    let callerCached: PhoneAuthResponse | null = null
    let targetCached: TargetUser | null = null
    try {
      const [cc, tc] = await Promise.all([
        env.CALLER_CACHE.get(callerCacheKey, { type: 'json' }),
        env.CALLER_CACHE.get(targetCacheKey, { type: 'json' })
      ])
      if (cc && typeof cc === 'object') callerCached = cc as PhoneAuthResponse
      if (tc && typeof tc === 'object') targetCached = tc as TargetUser
    } catch {
      // treat as a miss
    }

    // Fail-open context: voicemail-only (caller_known false) rather than
    // dropping the call; the 24h target cache still fills in the greeting name.
    const failOpenContext = (): PhoneAuthResponse => ({
      caller: {
        known: false,
        userId: null,
        name: null,
        username: null,
        accessLevel: 'UNKNOWN',
        relationship: 'none',
        verified
      },
      targetUser: targetCached
    })

    let context: PhoneAuthResponse | null = callerCached
    let source = 'caller-cache'
    if (!context) {
      if (remainingMs() > 200) {
        try {
          // Uses every millisecond left in the webhook window (up to the 9s
          // hard cap) so a slow/cold morpheus lookup still lands in time.
          context = await resolveCallerContext(env, callerPhone, verified, agentTarget, remainingMs())
          source = 'phone-auth'
          await env.CALLER_CACHE.put(callerCacheKey, JSON.stringify(context), {
            expirationTtl: CALLER_CACHE_TTL_SECONDS
          })
          if (context.targetUser) {
            targetCached = context.targetUser
            await env.CALLER_CACHE.put(targetCacheKey, JSON.stringify(context.targetUser), {
              expirationTtl: TARGET_CACHE_TTL_SECONDS
            })
          }
        } catch (error) {
          console.warn(
            '[dupip-mcp-edge] phone-auth failed',
            error instanceof Error ? error.message : error
          )
          source = 'fail-open'
          context = failOpenContext()
        }
      } else {
        // Deadline already exhausted — graceful fallback, call proceeds.
        source = 'fail-open'
        context = failOpenContext()
      }
    }

    // 2) Stateful actor — per-caller read-modify-write call session.
    // Bounded wait: call_count is cosmetic and never allowed to delay the
    // response past the webhook deadline.
    let callCount = 1
    if (remainingMs() > ACTOR_TIMEOUT_MS + 100) {
      try {
        const actorPromise = env.CALL_SESSION
          .idFromName(normalizeNumber(callerPhone) || 'unknown')
          .recordCall({ callerKnown: context.caller.known })
        const raceResult = await Promise.race([
          actorPromise.then((session) => ({ ok: true as const, callCount: session.callCount })),
          new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), ACTOR_TIMEOUT_MS))
        ])
        if (raceResult.ok) {
          callCount = raceResult.callCount
        }
      } catch (error) {
        console.warn(
          '[dupip-mcp-edge] actor call failed',
          error instanceof Error ? error.message : error
        )
      }
    }

    // 3) KV feature flag — toggle the voicemail flow without redeploying
    // (memoized per instance with a 30s TTL — zero RPC on warm requests).
    // Skipped when the window is exhausted; the default is "enabled".
    let voicemailFlowEnabled = true
    if (remainingMs() > 100) {
      voicemailFlowEnabled = await getVoicemailFlag(env)
    }

    const caller = context.caller
    const target = context.targetUser ?? targetCached

    console.log(
      `[dupip-mcp-edge] resolved in ${Date.now() - startedAt}ms via ${source}: known=${caller.known} level=${caller.accessLevel} target=${target?.name ?? target?.username ?? 'none'} calls=${callCount}`
    )

    const dynamicVariables = buildDynamicVariables(caller, target, callCount, voicemailFlowEnabled)

    console.log(
      `[dupip-mcp-edge] response dynamic_variables=${JSON.stringify(dynamicVariables)}`
    )

    return jsonResponse({ dynamic_variables: dynamicVariables })
  }
}
