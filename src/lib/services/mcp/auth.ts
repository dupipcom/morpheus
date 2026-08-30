/**
 * MCP endpoint authentication (phase 12).
 *
 * Two bearer schemes share the /api/mcp endpoint:
 *  1. Service key — the Telnyx AI assistant presents MCP_SERVICE_KEY
 *     (constant-time compare). Identity: "the assistant" (no Dupip user).
 *  2. Clerk OIDC access token — web MCP clients complete the web_auth flow
 *     (authorization code + PKCE against the Clerk OAuth app) and present the
 *     resulting access token. We verify the JWT against Clerk's JWKS and
 *     require the audience to be our OAuth client id (never accept foreign
 *     tokens — MCP spec forbids token passthrough).
 * Anything else is anonymous → the route answers 401 + WWW-Authenticate
 * (RFC 9728 resource metadata pointer).
 */

import 'server-only'

import { timingSafeEqual } from 'crypto'
import { verifyToken } from '@clerk/backend'

export type McpIdentity =
  | { kind: 'service-key' }
  | { kind: 'oauth'; clerkUserId: string }
  | { kind: 'anonymous' }

const SERVICE_KEY = () => process.env.MCP_SERVICE_KEY || ''
const OAUTH_CLIENT_ID = () => process.env.MCP_CLERK_OAUTH_CLIENT_ID || ''

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Resolve the identity behind a Bearer header. Returns anonymous for missing,
 * malformed, expired or foreign tokens — the route decides how to respond.
 */
export async function resolveMcpIdentity(
  authorizationHeader: string | null
): Promise<McpIdentity> {
  if (!authorizationHeader) return { kind: 'anonymous' }

  const [scheme, token] = authorizationHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return { kind: 'anonymous' }

  const serviceKey = SERVICE_KEY()
  if (serviceKey && safeEqual(token, serviceKey)) {
    return { kind: 'service-key' }
  }

  const clientId = OAUTH_CLIENT_ID()
  if (clientId) {
    try {
      const payload = await verifyToken(token, { audience: clientId })
      const sub = typeof payload.sub === 'string' ? payload.sub : ''
      const audOk =
        payload.aud === clientId ||
        (Array.isArray(payload.aud) && payload.aud.includes(clientId))
      const azpOk = !payload.azp || payload.azp === clientId
      if (sub && audOk && azpOk) {
        return { kind: 'oauth', clerkUserId: sub }
      }
    } catch {
      // Invalid/expired signature — fall through to anonymous
    }
  }

  return { kind: 'anonymous' }
}
