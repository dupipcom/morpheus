/**
 * MCP OAuth authorize facade (phase 12) — validates the client + redirect,
 * pins redirect_uri ↔ state in a short-lived cookie, then 302s to Clerk's
 * OIDC authorize endpoint (PKCE S256). The Clerk client secret never leaves
 * the server; the code returns to /api/mcp/oauth/callback.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  MCP_OAUTH_STATE_COOKIE,
  clerkIssuer,
  isAllowedRedirectUri,
  oauthCallbackUrl,
  oauthClientId
} from '@/lib/services/mcp/oauth'

const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  const redirectUri = url.searchParams.get('redirect_uri')
  const codeChallenge = url.searchParams.get('code_challenge')
  const state = url.searchParams.get('state')

  if (!clientId || clientId !== oauthClientId()) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'unknown client_id' }, { status: 400 })
  }
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'redirect_uri is not allowed' }, { status: 400 })
  }
  if (!codeChallenge || !PKCE_CHALLENGE_RE.test(codeChallenge)) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'code_challenge must be a 43-128 char base64url S256 challenge' }, { status: 400 })
  }
  if (!state || state.length > 128) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'state is required' }, { status: 400 })
  }

  const issuer = clerkIssuer()
  if (!issuer) {
    return NextResponse.json({ error: 'server_error', error_description: 'MCP_CLERK_OAUTH_ISSUER is not configured' }, { status: 500 })
  }

  const clerkUrl = new URL(`${issuer}/oauth/authorize`)
  clerkUrl.searchParams.set('client_id', clientId)
  clerkUrl.searchParams.set('response_type', 'code')
  clerkUrl.searchParams.set('redirect_uri', oauthCallbackUrl())
  clerkUrl.searchParams.set('scope', 'openid profile email offline_access')
  clerkUrl.searchParams.set('state', state)
  clerkUrl.searchParams.set('code_challenge', codeChallenge)
  clerkUrl.searchParams.set('code_challenge_method', 'S256')

  const response = NextResponse.redirect(clerkUrl.toString())
  // Open-redirect defense: the callback only redirects to the URI pinned here.
  response.cookies.set(
    MCP_OAUTH_STATE_COOKIE,
    Buffer.from(JSON.stringify({ state, redirectUri })).toString('base64url'),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600,
      path: '/api/mcp/oauth'
    }
  )
  return response
}
