/**
 * Streamable HTTP transport adapter for the Next.js route (phase 12).
 *
 * Stateless-first: Vercel serverless instances do not share memory, so any
 * session map would 404 after a cold start and force the client to churn
 * (re-initialize bursts → platform rate limits). Instead the server runs in
 * the SDK's stateless mode (no sessionIdGenerator): every POST gets a fresh
 * McpServer + transport pair, no session state is kept, and no
 * Mcp-Session-Id is issued. The MCP spec requires clients to cope with
 * sessionless servers, and the SDK does not require initialize before
 * tool calls.
 *
 * GET has no server-initiated streams in stateless mode (405 is allowed by
 * the spec); DELETE is a no-op.
 */

import 'server-only'

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { buildMcpServer } from './server'

export async function handleMcpRequest(request: Request): Promise<Response> {
  const method = request.method.toUpperCase()

  if (method === 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (method === 'DELETE') {
    return new Response(null, { status: 200 })
  }

  if (method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Stateless mode — the SDK requires a fresh transport per request.
  const server = buildMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    void server.close().catch(() => {})
  }
}
