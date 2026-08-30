/**
 * MCP OAuth token endpoint (phase 12) — proxies authorization_code and
 * refresh_token grants to Clerk's token endpoint. The client presents the
 * PKCE verifier here; the Clerk client secret is applied server-side and
 * never leaves the process.
 */

import { NextRequest, NextResponse } from 'next/server'
import { clerkIssuer, oauthCallbackUrl, oauthClientId } from '@/lib/services/mcp/oauth'

export async function POST(request: NextRequest) {
  const issuer = clerkIssuer()
  const clientId = oauthClientId()
  const clientSecret = process.env.MCP_CLERK_OAUTH_CLIENT_SECRET || ''
  if (!issuer || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'server_error', error_description: 'OAuth is not configured' }, { status: 500 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'JSON body required' }, { status: 400 })
  }

  const params = new URLSearchParams()
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)

  if (body.grant_type === 'authorization_code') {
    const code = typeof body.code === 'string' ? body.code : ''
    const verifier = typeof body.code_verifier === 'string' ? body.code_verifier : ''
    if (!code || !verifier) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'code and code_verifier are required' }, { status: 400 })
    }
    params.set('grant_type', 'authorization_code')
    params.set('code', code)
    params.set('code_verifier', verifier)
    params.set('redirect_uri', oauthCallbackUrl())
  } else if (body.grant_type === 'refresh_token') {
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : ''
    if (!refreshToken) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'refresh_token is required' }, { status: 400 })
    }
    params.set('grant_type', 'refresh_token')
    params.set('refresh_token', refreshToken)
  } else {
    return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 })
  }

  const response = await fetch(`${issuer}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: typeof payload?.error === 'string' ? payload.error : undefined },
      { status: 400 }
    )
  }
  return NextResponse.json(payload)
}
