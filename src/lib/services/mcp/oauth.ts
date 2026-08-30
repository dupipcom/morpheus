/**
 * OAuth helpers for the MCP authorization layer (phase 12).
 *
 * Clerk is the OIDC provider; morpheus acts as a thin authorization-server
 * facade: web_auth returns OUR authorize URL (PKCE S256), we pin the client's
 * redirect_uri to the state in a short-lived cookie (open-redirect defense),
 * 302 to Clerk, receive the code at /api/mcp/oauth/callback and hand it back
 * to the client, which exchanges it (+verifier) at /api/mcp/oauth/token.
 * The Clerk client secret never leaves the server.
 */

import 'server-only'

export function mcpOrigin(): string {
  return (process.env.MCP_PUBLIC_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '')
}

/** RFC 8252 loopback URIs and our own origin are the only allowed redirects. */
export function isAllowedRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
    const originUrl = new URL(mcpOrigin())
    return url.origin === originUrl.origin
  } catch {
    return false
  }
}

export function clerkIssuer(): string {
  return (process.env.MCP_CLERK_OAUTH_ISSUER || '').replace(/\/+$/, '')
}

export function oauthClientId(): string {
  return process.env.MCP_CLERK_OAUTH_CLIENT_ID || ''
}

export function oauthCallbackUrl(): string {
  return `${mcpOrigin()}/api/mcp/oauth/callback`
}

export const MCP_OAUTH_STATE_COOKIE = 'mcp_oauth_state'

/**
 * Build the web_auth authorization URL. PKCE parameters come from the MCP
 * client (it holds the verifier); the state is generated here and echoed by
 * the callback so the redirect can be validated.
 */
export function buildAuthorizationUrl(input: {
  redirectUri: string
  codeChallenge: string
  resource?: string
}): { authorizationUrl: string; state: string } {
  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: oauthClientId(),
    redirect_uri: input.redirectUri,
    response_type: 'code',
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    state
  })
  if (input.resource) params.set('resource', input.resource)
  return {
    authorizationUrl: `${mcpOrigin()}/api/mcp/oauth/authorize?${params.toString()}`,
    state
  }
}
