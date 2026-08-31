/**
 * Phone delegations (phase 12) — numbers authorized to converse with the
 * caller's Telnyx assistant at fine-grained note scopes (/app/feel
 * third-party tab). Clerk-authenticated, owner-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/services/auth'
import { ApiError, toResponse } from '@/lib/services/errors'
import {
  listPhoneDelegations,
  upsertPhoneDelegation
} from '@/lib/services/phone-delegation'
import type { MoodScope, NoteVisibility } from '@/generated/prisma/client'

export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const delegations = await listPhoneDelegations(authResult.user!.id)
    return NextResponse.json({ delegations })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/phone-delegations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber : ''
    if (!phoneNumber.trim()) {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 })
    }

    const label = typeof body.label === 'string' && body.label.trim() ? body.label : undefined
    const scopes = Array.isArray(body.scopes) ? (body.scopes as NoteVisibility[]) : undefined
    // Validated against the MoodScope enum inside the service (default NONE).
    const moodScope =
      typeof body.moodScope === 'string' && body.moodScope.trim()
        ? (body.moodScope as MoodScope)
        : undefined

    const delegation = await upsertPhoneDelegation(authResult.user!.id, {
      phoneNumber,
      label,
      scopes,
      moodScope
    })

    return NextResponse.json({ delegation })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/phone-delegations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
