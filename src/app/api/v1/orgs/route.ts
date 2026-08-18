/**
 * Organizations API Route Handler (Phase 7)
 *
 * GET: Organizations the viewer belongs to (with role).
 * POST: Create an organization — Clerk org + mirror + OWNER membership +
 * default `general` channel + org wallet.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listOrgsForUser, createOrganization } from '@/lib/services/org'

/**
 * GET /api/v1/orgs
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const orgs = await listOrgsForUser(user.id)

    return NextResponse.json({ orgs })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/orgs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/orgs
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { name, slug } = body as Record<string, unknown>
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 })
    }

    const organization = await createOrganization({
      viewerUserId: userId,
      name: sanitizeText(name.trim()),
      slug: typeof slug === 'string' ? slug : null
    })

    return NextResponse.json({ organization })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/orgs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
