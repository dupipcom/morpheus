/**
 * Streamable HTTP transport adapter for the Next.js route (phase 12).
 *
 * Sessions live in an in-memory map (per serverless instance — Vercel cold
 * starts lose them, which is fine: per the MCP spec a client MUST re-init
 * when it gets 404 for a stale session id). Sessionless POSTs are handled by
 * an ephemeral server: initialize registers a session, single-shot tool calls
 * complete without one.
 */

import 'server-only'

import { randomUUID } from 'crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { buildMcpServer } from './server'

const SESSION_TTL_MS = 10 * 60_000

interface ActiveSession {
  transport: WebStandardStreamableHTTPServerTransport
  server: McpServer
  createdAt: number
}

const sessions = new Map<string, ActiveSession>()

function sweepSessions(): void {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      void session.server.close().catch(() => {})
      sessions.delete(id)
    }
  }
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  sweepSessions()

  const sessionId = request.headers.get('mcp-session-id')
  const method = request.method.toUpperCase()

  if (method === 'DELETE') {
    const session = sessionId ? sessions.get(sessionId) : undefined
    if (!session) return new Response('Session not found', { status: 404 })
    void session.server.close().catch(() => {})
    sessions.delete(sessionId as string)
    return new Response(null, { status: 200 })
  }

  if (method === 'GET') {
    // Server-initiated stream for an existing session only (spec allows 405)
    const session = sessionId ? sessions.get(sessionId) : undefined
    if (!session) return new Response('Method Not Allowed', { status: 405 })
    return session.transport.handleRequest(request)
  }

  if (method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const session = sessionId ? sessions.get(sessionId) : undefined
  if (session) {
    return session.transport.handleRequest(request)
  }

  if (sessionId) {
    // Stale session (cold start / expiry) — the client re-initializes per spec
    return new Response('Session not found', { status: 404 })
  }

  // Sessionless: ephemeral server for initialize or single-shot tool calls.
  const server = buildMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true
  })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(request)
    const newSessionId = response.headers.get('mcp-session-id')
    if (newSessionId) {
      sessions.set(newSessionId, { transport, server, createdAt: Date.now() })
    } else {
      void server.close().catch(() => {})
    }
    return response
  } catch (error) {
    void server.close().catch(() => {})
    throw error
  }
}
