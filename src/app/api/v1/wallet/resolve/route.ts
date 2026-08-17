/**
 * Wallet resolve API Route Handler (Phase 6)
 *
 * GET: Resolve a recipient for the transfer UI across the shared /@ namespace
 * (users today; orgs in Phase 7; projects 404 until the donate follow-up).
 * Query: ?username= (accepts wallet id, address, or @handle).
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveRecipient } from '@/lib/services/wallet'
import { ApiError, toResponse } from '@/lib/services/errors'

/**
 * GET /api/v1/wallet/resolve
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const username = searchParams.get('username')
    if (!username || !username.trim()) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 })
    }

    const recipient = await resolveRecipient(username)

    return NextResponse.json({ recipient })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/wallet/resolve:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
