/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414) for the Dupip MCP server
 * (phase 12). We are a thin facade over Clerk's OIDC endpoints — this document
 * advertises OUR endpoints (authorize/token) so the Clerk client secret stays
 * server-side and redirects are validated against our allowlist.
 */

import { NextResponse } from 'next/server'
import { clerkIssuer, mcpOrigin } from '@/lib/services/mcp/oauth'

export async function GET() {
  const base = mcpOrigin()
  const issuer = clerkIssuer()
  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/oauth/authorize`,
    token_endpoint: `${base}/api/mcp/oauth/token`,
    userinfo_endpoint: issuer ? `${issuer}/oauth/userinfo` : undefined,
    revocation_endpoint: issuer ? `${issuer}/oauth/revoke` : undefined,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access']
  })
}
