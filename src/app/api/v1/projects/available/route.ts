/**
 * Project handle availability check (shared /@ namespace).
 *
 * GET /api/v1/projects/available?username=
 * Returns { available: boolean } — the handle is checked against
 * Project.username, Profile.username and Organization.username, and against
 * the handle shape (lowercase letters/digits/dashes, max 64).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isUsernameAvailable } from '@/lib/services/projects'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')
    if (!username) {
      return NextResponse.json({ error: 'Missing username parameter' }, { status: 400 })
    }

    const available = await isUsernameAvailable(username)

    return NextResponse.json({ available })
  } catch (error) {
    console.error('Error in GET /api/v1/projects/available:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
