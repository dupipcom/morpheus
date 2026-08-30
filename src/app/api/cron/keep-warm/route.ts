import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/chat/unreadChatEmailNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const EDGE_FUNCTION_URL = 'https://dupip-mcp-edge-afd30602-9.telnyxcompute.com'
const DEMO_AGENT_TARGET = '+19294474448'

/**
 * Keep-warm pinger (phase 12): the Telnyx edge function and the Vercel
 * phone-auth lambda both idle out after ~10 min, and a cold start costs
 * 2-6s — past the assistant's variable deadline. This cron touches both:
 *
 * - phone-auth: a real (cheap) lookup — unknown dummy caller, so pure DB
 *   reads; keeps the lambda warm so the edge's first call of a burst
 *   completes in hundreds of ms instead of a cold start.
 * - edge: an unsigned POST boots a warm instance. It fails signature
 *   verification (401) but any request wakes an instance, so the next real
 *   call skips the cold start.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = (process.env.MCP_PUBLIC_ORIGIN ?? 'https://www.dupip.com').replace(/\/+$/, '')
  const edgeSecret = process.env.MCP_EDGE_SECRET ?? ''

  const results = await Promise.allSettled([
    fetch(`${baseUrl}/api/v1/mcp/edge/phone-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-edge-secret': edgeSecret
      },
      body: JSON.stringify({
        phone: '+15550000000',
        verified: false,
        agentTarget: DEMO_AGENT_TARGET
      }),
      cache: 'no-store'
    }),
    fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store'
    })
  ])

  const statuses = results.map((result) =>
    result.status === 'fulfilled'
      ? `ok:${result.value.status}`
      : `rejected: ${String(result.reason)}`
  )

  return NextResponse.json({ ok: true, statuses })
}
