/**
 * MCP OAuth callback (phase 12) — receives the authorization code from Clerk,
 * validates the state against the pinned cookie, and redirects the client's
 * browser to its own redirect_uri with code + state. The client then
 * exchanges code + PKCE verifier at /api/mcp/oauth/token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { MCP_OAUTH_STATE_COOKIE, isAllowedRedirectUri } from '@/lib/services/mcp/oauth'

interface PinnedState {
  state: string
  redirectUri: string
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  let pinned: PinnedState | null = null
  const cookieValue = request.cookies.get(MCP_OAUTH_STATE_COOKIE)?.value
  if (cookieValue) {
    try {
      pinned = JSON.parse(Buffer.from(cookieValue, 'base64url').toString()) as PinnedState
    } catch {
      pinned = null
    }
  }

  if (!pinned || pinned.state !== state || !isAllowedRedirectUri(pinned.redirectUri)) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'state mismatch or expired flow' }, { status: 400 })
  }

  const target = new URL(pinned.redirectUri)
  target.searchParams.set('code', code)
  target.searchParams.set('state', state)

  const response = NextResponse.redirect(target.toString())
  response.cookies.delete(MCP_OAUTH_STATE_COOKIE)
  return response
}
