/**
 * Organization members API Route Handler (Phase 7)
 *
 * GET: Members of an org (any member).
 * POST: Add a member — proxied to Clerk, then mirrored. Body:
 *   { userId: <clerk user id>, role: 'ADMIN' | 'MANAGER' | 'MEMBER' | 'STAFF' }
 * (OWNER/ADMIN of the org only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { upsertMembership, syncOrganization } from '@/lib/services/org'

const MANAGE_ROLES = ['OWNER', 'ADMIN']
const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'STAFF']

/**
 * GET /api/v1/orgs/[orgId]/members
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

    const members = await prisma.orgMembership.findMany({
      where: { orgId },
      include: {
        user: { select: { id: true, userId: true, profiles: { select: { data: true } } } }
      },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json({
      members: members.map((m) => ({
        ...m,
        profile: {
          userName: (m.user.profiles?.[0]?.data as { username?: { value?: string } } | undefined)?.username?.value ?? null,
          profilePicture: (m.user.profiles?.[0]?.data as { profilePicture?: { value?: string } } | undefined)?.profilePicture?.value ?? null
        },
        user: undefined
      }))
    })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/orgs/[orgId]/members:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/v1/orgs/[orgId]/members
 */
export async function POST(
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

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { clerkOrgId: true }
    })
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const membership = await prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
      select: { role: true }
    })
    if (!membership || !MANAGE_ROLES.includes(membership.role)) {
      return NextResponse.json({ error: 'Only org owners and admins can manage members' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { userId: memberClerkUserId, role } = body as Record<string, unknown>
    if (typeof memberClerkUserId !== 'string' || !memberClerkUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }
    if (typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of ${ASSIGNABLE_ROLES.join(', ')}` }, { status: 400 })
    }

    // Proxy to Clerk (source of truth), then mirror locally
    try {
      const { clerkClient } = await import('@clerk/nextjs/server')
      const client = await clerkClient()
      await client.organizations.createOrganizationMembership({
        organizationId: organization.clerkOrgId,
        userId: memberClerkUserId,
        role: role as 'admin' | 'basic_member' | 'guest_member'
      })
    } catch (error) {
      console.error('Clerk createOrganizationMembership failed:', error)
      return NextResponse.json({ error: 'Failed to add member (Clerk)' }, { status: 400 })
    }

    await upsertMembership({
      clerkOrgId: organization.clerkOrgId,
      clerkUserId: memberClerkUserId,
      role: role.toUpperCase()
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in POST /api/v1/orgs/[orgId]/members:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
