/**
 * DELETE /api/v1/phone-delegations/[id] — revoke a phone-number grant
 * (phase 12). Owner-only; removing the grant returns the caller to
 * UNKNOWN/PUBLIC on subsequent calls (after the edge caller cache).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/services/auth'
import { ApiError, toResponse } from '@/lib/services/errors'
import { deletePhoneDelegation } from '@/lib/services/phone-delegation'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params
    const deleted = await deletePhoneDelegation(authResult.user!.id, id)
    if (!deleted) {
      return NextResponse.json({ error: 'Phone delegation not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in DELETE /api/v1/phone-delegations/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
