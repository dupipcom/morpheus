import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureOrgMembership, getCurrentChatUser } from '@/lib/chat/auth'
import { canManageInvites } from '@/lib/chat/permissions'
import { jsonError } from '@/lib/chat/api'
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
    const invite = await prisma.chatInviteLink.create({
      data: {
        clerkOrgId: orgId,
        token: randomBytes(24).toString('base64url'),
        createdByUserId: user.id,
        maxUses: body?.maxUses ? Number(body.maxUses) : null,
        expiresAt: body?.expiresAt ? new Date(body.expiresAt) : null,
      },
    })

    await publishAblyEvent(getChatOrgMetaChannelName(orgId), CHAT_EVENTS.INVITE_CREATED, {
      orgId,
      inviteId: invite.id,
    })

    return NextResponse.json({ invite })
  } catch (error) {
    console.error('Error creating invite:', error)
    if (error instanceof Error && error.message === 'Forbidden') return jsonError('Forbidden', 403)
    return jsonError('Internal server error', 500)
  }
}
