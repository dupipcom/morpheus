import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ensureOrgMembership, getCurrentChatUser, toClerkOrganizationRole } from '@/lib/chat/auth'
import { canAssignRoles } from '@/lib/chat/permissions'
import { jsonError } from '@/lib/chat/api'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { getChatOrgMetaChannelName } from '@/lib/chat/realtime/channelNames'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'

const VALID_ROLES = new Set(['SUPERUSER', 'ADMIN', 'MODERATOR', 'USER'])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { orgId } = await params
    const currentMembership = await ensureOrgMembership(orgId, user.id)
    if (!canAssignRoles(currentMembership.role)) {
      return jsonError('Forbidden', 403)
    }

    const body = await request.json()
    const targetUserId = String(body?.userId || '')
    const role = String(body?.role || '').toUpperCase()

    if (!targetUserId || !VALID_ROLES.has(role)) {
      return jsonError('A valid userId and role are required')
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } })
    if (!targetUser) return jsonError('User not found', 404)

    const membership = await prisma.chatOrgMembership.upsert({
      where: {
        clerkOrgId_userId: {
          clerkOrgId: orgId,
          userId: targetUser.id,
        },
      },
      update: { role: role as 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER' },
      create: {
        clerkOrgId: orgId,
        userId: targetUser.id,
        role: role as 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER',
      },
    })

    if (targetUser.userId) {
      const client = await clerkClient()
      try {
        await client.organizations.updateOrganizationMembership({
          organizationId: orgId,
          userId: targetUser.userId,
          role: toClerkOrganizationRole(role as 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER'),
        })
      } catch {
        await client.organizations.createOrganizationMembership({
          organizationId: orgId,
          userId: targetUser.userId,
          role: toClerkOrganizationRole(role as 'SUPERUSER' | 'ADMIN' | 'MODERATOR' | 'USER'),
        })
      }
    }

    await publishAblyEvent(getChatOrgMetaChannelName(orgId), CHAT_EVENTS.MEMBERSHIP_UPDATED, {
      orgId,
      userId: targetUser.id,
      role,
    })

    return NextResponse.json({ membership })
  } catch (error) {
    console.error('Error updating chat role:', error)
    if (error instanceof Error && error.message === 'Forbidden') return jsonError('Forbidden', 403)
    return jsonError('Internal server error', 500)
  }
}
