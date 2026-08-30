/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the Dupip MCP server
 * (phase 12). Unauthenticated — this is how MCP clients discover the
 * authorization server after a 401 + WWW-Authenticate.
 */

import { NextResponse } from 'next/server'
import { mcpOrigin } from '@/lib/services/mcp/oauth'

export async function GET() {
  return NextResponse.json({
    resource: mcpOrigin(),
    authorization_servers: [`${mcpOrigin()}/api/mcp/.well-known/oauth-authorization-server`],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    bearer_methods_supported: ['header']
  })
}
