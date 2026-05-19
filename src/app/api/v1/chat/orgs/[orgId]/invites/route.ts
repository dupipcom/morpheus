import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canStartDirectMessage, ensureOrgMembership, getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError, publishUserInvalidation } from '@/lib/chat/api'
import { canManageInvites } from '@/lib/chat/permissions'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { getChatOrgMetaChannelName } from '@/lib/chat/realtime/channelNames'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { orgId } = await params
    const membership = await ensureOrgMembership(orgId, user.id)
    if (!canManageInvites(membership.role)) return jsonError('Forbidden', 403)

    const invites = await prisma.chatInviteLink.findMany({
      where: { clerkOrgId: orgId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ invites })
  } catch (error) {
    console.error('Error listing invites:', error)
    if (error instanceof Error && error.message === 'Forbidden') return jsonError('Forbidden', 403)
    return jsonError('Internal server error', 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { orgId } = await params
    const membership = await ensureOrgMembership(orgId, user.id)
    if (!canManageInvites(membership.role)) return jsonError('Forbidden', 403)

    const body = await request.json()
    const inviteeUserId = body?.inviteeUserId ? String(body.inviteeUserId) : null

    if (inviteeUserId) {
      const [canInviteDirectly, existingMembership] = await Promise.all([
        canStartDirectMessage(user.id, inviteeUserId),
        prisma.chatOrgMembership.findUnique({
          where: {
            clerkOrgId_userId: {
              clerkOrgId: orgId,
              userId: inviteeUserId,
            },
          },
          select: { id: true },
        }),
      ])

      if (!canInviteDirectly) {
        return jsonError('Direct org invitations are limited to friends and close friends', 403)
      }

      if (existingMembership) {
        return jsonError('User is already in this organization', 400)
      }
    }

    const maxUses = inviteeUserId ? 1 : body?.maxUses ? Number(body.maxUses) : null
    const invite = await prisma.chatInviteLink.create({
      data: {
        clerkOrgId: orgId,
        token: randomBytes(24).toString('base64url'),
        createdByUserId: user.id,
        inviteeUserId,
        maxUses,
        expiresAt: body?.expiresAt ? new Date(body.expiresAt) : null,
      },
    })

    await Promise.all([
      publishAblyEvent(getChatOrgMetaChannelName(orgId), CHAT_EVENTS.INVITE_CREATED, {
        orgId,
        inviteId: invite.id,
      }),
      inviteeUserId ? publishUserInvalidation([inviteeUserId], { inviteId: invite.id, orgId }) : Promise.resolve(),
    ])

    return NextResponse.json({ invite })
  } catch (error) {
    console.error('Error creating invite:', error)
    if (error instanceof Error && error.message === 'Forbidden') return jsonError('Forbidden', 403)
    return jsonError('Internal server error', 500)
  }
}
