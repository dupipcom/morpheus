import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { ensureUserAndProfile } from '@/lib/services/user/ensureUserAndProfile'

export const runtime = 'nodejs'

/**
 * POST /api/v1/user/ensure
 *
 * Idempotent bootstrap endpoint invoked by middleware (fire-and-forget) the
 * first time we see an authenticated request that hasn't been bootstrapped
 * yet. Guarantees a `User` + public `Profile` exist for the caller.
 */
export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureUserAndProfile(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[POST /api/v1/user/ensure] failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
