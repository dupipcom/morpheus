/**
 * Dupip MCP endpoint (phase 12) — Streamable HTTP transport, per the
 * MCP spec (2025-06-18): single endpoint, POST + GET (+DELETE for session
 * termination).
 *
 * Auth: either the MCP_SERVICE_KEY bearer (Telnyx AI assistant) or a
 * Clerk-issued OIDC access token (web MCP clients via web_auth). Anonymous
 * requests get 401 + WWW-Authenticate pointing at the RFC 9728 resource
 * metadata. Origin is validated against DNS-rebinding when present.
 *
 * API routes are exempt from the Clerk middleware (middleware.ts returns
 * early for /api), so auth happens here — same pattern as /api/v1/telnyx.
 */

import { NextRequest } from 'next/server'
import { resolveMcpIdentity } from '@/lib/services/mcp/auth'
import { handleMcpRequest } from '@/lib/services/mcp/transport'
import { mcpOrigin } from '@/lib/services/mcp/oauth'

export const maxDuration = 120
export const runtime = 'nodejs'

function isAllowedOrigin(origin: string): boolean {
  const allowed = [mcpOrigin()]
  if (process.env.NODE_ENV !== 'production') {
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return true
    }
  }
  return allowed.some((entry) => entry === origin)
}

async function guard(request: NextRequest): Promise<Response | null> {
  const origin = request.headers.get('origin')
  if (origin && !isAllowedOrigin(origin)) {
    return new Response('Forbidden', { status: 403 })
  }

  const identity = await resolveMcpIdentity(request.headers.get('authorization'))
  if (identity.kind === 'anonymous') {
    const metadataUrl = `${mcpOrigin()}/api/mcp/.well-known/oauth-protected-resource`
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"`
      }
    })
  }
  return null
}

export async function POST(request: NextRequest): Promise<Response> {
  const blocked = await guard(request)
  if (blocked) return blocked
  return handleMcpRequest(request)
}

export async function GET(request: NextRequest): Promise<Response> {
  const blocked = await guard(request)
  if (blocked) return blocked
  return handleMcpRequest(request)
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const blocked = await guard(request)
  if (blocked) return blocked
  return handleMcpRequest(request)
}
