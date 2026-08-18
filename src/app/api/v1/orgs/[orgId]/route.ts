/**
 * Organization detail API Route Handler (Phase 7)
 *
 * GET: Organization detail (members only).
 * PUT: Update public-profile fields (OWNER/ADMIN of the org).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { sanitizeText, sanitizeHTML, sanitizeURL } from '@/lib/utils/sanitize'
import { ApiError, toResponse } from '@/lib/services/errors'

/**
 * GET /api/v1/orgs/[orgId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
): Promise<NextResponse> {
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

    const { orgId } = await params

    const membership = await prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
      select: { role: true }
    })
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        members: true,
        lists: { select: { id: true, name: true, publicUrl: true, publicVisible: true } },
        projects: { select: { id: true, name: true, username: true, publicVisible: true } }
      }
    })
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    return NextResponse.json({ organization, viewerRole: membership.role })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/orgs/[orgId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/v1/orgs/[orgId] — public-profile fields (OWNER/ADMIN)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
): Promise<NextResponse> {
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

    const { orgId } = await params

    const membership = await prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
      select: { role: true }
    })
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Only org owners and admins can update the profile' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { name, bio, links, location, publicVisible } = body as Record<string, unknown>

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'Name must be a non-empty string' }, { status: 400 })
    }
    if (bio !== undefined && typeof bio !== 'string') {
      return NextResponse.json({ error: 'Bio must be a string' }, { status: 400 })
    }
    if (publicVisible !== undefined && typeof publicVisible !== 'boolean') {
      return NextResponse.json({ error: 'publicVisible must be a boolean' }, { status: 400 })
    }

    let parsedLinks: Array<{ label: string; url: string }> | undefined
    if (links !== undefined && links !== null) {
      if (
        !Array.isArray(links) ||
        !links.every(
          (l) =>
            typeof l === 'object' &&
            l !== null &&
            typeof (l as Record<string, unknown>).label === 'string' &&
            typeof (l as Record<string, unknown>).url === 'string'
        )
      ) {
        return NextResponse.json({ error: 'Links must be an array of { label, url }' }, { status: 400 })
      }
      parsedLinks = (links as Array<{ label: string; url: string }>).map((l) => ({
        label: sanitizeText(l.label),
        url: sanitizeURL(l.url)
      }))
    }

    const organization = await prisma.organization.update({
      where: { id: orgId },
      data: {
        name: typeof name === 'string' ? sanitizeText(name.trim()) : undefined,
        bio: typeof bio === 'string' ? sanitizeHTML(bio) : undefined,
        links: parsedLinks,
        location: location !== undefined ? (typeof location === 'object' ? location : null) : undefined,
        publicVisible: typeof publicVisible === 'boolean' ? publicVisible : undefined
      }
    })

    return NextResponse.json({ organization })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in PUT /api/v1/orgs/[orgId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
