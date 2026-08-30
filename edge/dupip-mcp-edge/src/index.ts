/**
 * Dupip voice edge function (phase 12) — dynamic-variables webhook for the
 * Telnyx AI assistant.
 *
 * Flow per inbound call:
 *   assistant.initialization (signed) → verify Ed25519 (5-min window)
 *   → KV caller cache (10 min TTL) → miss: morpheus
 *     POST /api/v1/mcp/edge/phone-auth (2.5s client timeout)
 *   → Stateful Actor recordCall (per-caller RMW: callCount/lastIntent)
 *   → KV feature flag (voicemail_flow_enabled)
 *   → dynamic_variables for the workflow (greeting, routing, tools).
 *
 * Budget: the assistant's dynamic_variables_webhook_timeout_ms is set to 5000
 * (platform default 1500, max 10000). The morpheus call is aborted at 2.5s so
 * cold calls stay inside the window; repeat calls hit the KV cache.
 */

import { DupipCallSession } from './dupip-call-session'

// Re-export the actor class so the platform and `telnyx-edge types` can wire
// the CALL_SESSION binding to the class defined in this project.
export { DupipCallSession }

const SIGNATURE_WINDOW_SECONDS = 300
const CALLER_CACHE_TTL_SECONDS = 600
const MORPHEUS_TIMEOUT_MS = 2500

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

interface CallerIdentity {
  known: boolean
  userId: string | null
  name: string | null
  username: string | null
  accessLevel: string
  relationship: string
  verified: boolean
}

interface PhoneAuthResponse {
  caller: CallerIdentity
  targetUser: { userId: string; name: string | null; username: string | null } | null
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
  agentTarget: string
): Promise<PhoneAuthResponse> {
  const baseUrl = (await env.SECRETS.get('MORPHEUS_BASE_URL')).replace(/\/+$/, '')
  const secret = await env.SECRETS.get('MORPHEUS_EDGE_SECRET')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MORPHEUS_TIMEOUT_MS)
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const rawBody = await request.text()
    const signature =
      request.headers.get('telnyx-signature-ed25519') ?? request.headers.get('webhook-signature')
    const timestamp =
      request.headers.get('telnyx-timestamp') ?? request.headers.get('webhook-timestamp')

    const publicKeySecret = await env.SECRETS.get('TELNYX_WEBHOOK_PUBLIC_KEY').catch(() => '')
    if (!publicKeySecret) {
      return jsonResponse({ error: 'Missing TELNYX_WEBHOOK_PUBLIC_KEY secret' }, 500)
    }
    if (!(await verifyTelnyxSignature(publicKeySecret, timestamp, rawBody, signature))) {
      return jsonResponse({ error: 'Invalid signature' }, 401)
    }

    let payload: { event_type?: string; data?: { payload?: Record<string, unknown> } }
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }

    if (payload.event_type !== 'assistant.initialization') {
      // Unknown events are a no-op (2xx fast so Telnyx does not retry)
      return jsonResponse({ ok: true })
    }

    const data = payload.data?.payload ?? {}
    const callerPhone =
      typeof data.telnyx_end_user_target === 'string' ? data.telnyx_end_user_target : ''
    const verified = data.telnyx_end_user_target_verified === true
    const agentTarget = typeof data.telnyx_agent_target === 'string' ? data.telnyx_agent_target : ''

    // 1) KV caller cache (10 min) — repeat calls skip the morpheus round-trip
    const cacheKey = `caller/${normalizeNumber(callerPhone)}`
    let context: PhoneAuthResponse | null = null
    try {
      const cached = await env.CALLER_CACHE.get(cacheKey, { type: 'json' })
      if (cached && typeof cached === 'object') {
        context = cached as PhoneAuthResponse
      }
    } catch {
      context = null
    }

    if (!context) {
      try {
        context = await resolveCallerContext(env, callerPhone, verified, agentTarget)
        await env.CALLER_CACHE.put(cacheKey, JSON.stringify(context), {
          expirationTtl: CALLER_CACHE_TTL_SECONDS
        })
      } catch (error) {
        console.warn(
          '[dupip-mcp-edge] phone-auth failed',
          error instanceof Error ? error.message : error
        )
        // Fail open to voicemail-only (caller_known false) rather than drop the call
        context = {
          caller: {
            known: false,
            userId: null,
            name: null,
            username: null,
            accessLevel: 'UNKNOWN',
            relationship: 'none',
            verified
          },
          targetUser: null
        }
      }
    }

    // 2) Stateful actor — per-caller read-modify-write call session
    let callCount = 1
    try {
      const session = await env.CALL_SESSION
        .idFromName(normalizeNumber(callerPhone) || 'unknown')
        .recordCall({ callerKnown: context.caller.known })
      callCount = session.callCount
    } catch (error) {
      console.warn(
        '[dupip-mcp-edge] actor call failed',
        error instanceof Error ? error.message : error
      )
    }

    // 3) KV feature flag — toggle the voicemail flow without redeploying
    let voicemailFlowEnabled = true
    try {
      const flag = await env.CALLER_CACHE.get('flags/voicemail_flow_enabled')
      if (typeof flag === 'string') {
        voicemailFlowEnabled = flag === 'true'
      }
    } catch {
      // default on
    }

    const caller = context.caller
    const target = context.targetUser

    // All values are strings — they interpolate into {{var}} slots in the
    // assistant's instructions, greeting, and expression edge conditions.
    return jsonResponse({
      dynamic_variables: {
        caller_known: caller.known ? 'true' : 'false',
        caller_full_name: caller.name ?? 'friend',
        caller_username: caller.username ?? '',
        caller_access_level: caller.accessLevel,
        caller_relationship: caller.relationship,
        caller_verified: caller.verified ? 'true' : 'false',
        call_count: String(callCount),
        target_user_name: target?.name ?? target?.username ?? 'the user',
        voicemail_flow_enabled: voicemailFlowEnabled ? 'true' : 'false'
      },
      memory: {
        conversation_query: target?.name ? `${target.name}'s week` : undefined
      },
      conversation: {
        metadata: {
          dupip_caller_known: caller.known,
          dupip_caller_verified: caller.verified
        }
      }
    })
  }
}
