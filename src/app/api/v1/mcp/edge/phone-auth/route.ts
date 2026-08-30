/**
 * Internal edge phone-auth endpoint (phase 12).
 *
 * Called by the Telnyx Edge Function at assistant.initialization time to
 * resolve the caller + the dialed number's owner within the dynamic-variables
 * webhook budget (the edge function enforces a ~2.5s client timeout). Pure DB
 * lookups only — no AI calls. Guarded by x-mcp-edge-secret (falls back to
 * INTERNAL_FETCH_SECRET). No PII is logged.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCallerByPhone } from '@/lib/services/mcp/callerLookup'
import { resolveTargetUser } from '@/lib/services/mcp/targetResolution'
import { resolvePhoneAccess } from '@/lib/services/mcp/queryUserData'

export const maxDuration = 15

export async function POST(request: NextRequest) {
  const secret = process.env.MCP_EDGE_SECRET || process.env.INTERNAL_FETCH_SECRET
  if (!secret || request.headers.get('x-mcp-edge-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const verified = body.verified === true
  const agentTarget = typeof body.agentTarget === 'string' ? body.agentTarget.trim() : ''

  if (!phone && !agentTarget) {
    return NextResponse.json({ error: 'phone or agentTarget is required' }, { status: 400 })
  }

  const [caller, targetUser] = await Promise.all([
    resolveCallerByPhone({ phone, verified }),
    resolveTargetUser(null, agentTarget || null)
  ])

  let accessLevel = caller.identity.accessLevel
  let relationship = caller.identity.relationship
  if (caller.callerUserId && targetUser) {
    const access = await resolvePhoneAccess(caller.callerUserId, targetUser.userId)
    accessLevel = access.accessLevel
    relationship =
      access.accessLevel === 'OWNER'
        ? 'self'
        : access.accessLevel === 'DELEGATE'
          ? 'delegate'
          : 'none'
  }

  return NextResponse.json({
    caller: {
      known: caller.identity.known,
      userId: caller.identity.userId ?? null,
      name: caller.identity.name ?? null,
      username: caller.identity.username ?? null,
      accessLevel,
      relationship,
      verified: caller.identity.verified
    },
    targetUser: targetUser
      ? {
          userId: targetUser.userId,
          name: targetUser.name ?? null,
          username: targetUser.username ?? null
        }
      : null
  })
}
