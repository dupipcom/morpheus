import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureOrgMembership, getCurrentChatUser } from '@/lib/chat/auth'
import { canManageChannels } from '@/lib/chat/permissions'
import { jsonError, slugifyChatName } from '@/lib/chat/api'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { sanitizeText } from '@/lib/utils/sanitize'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { getChatOrgMetaChannelName } from '@/lib/chat/realtime/channelNames'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { orgId } = await params
    await ensureOrgMembership(orgId, user.id)

    const channels = await prisma.chatChannel.findMany({
      where: { clerkOrgId: orgId, archived: false },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ channels })
  } catch (error) {
    console.error('Error listing channels:', error)
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
    if (!canManageChannels(membership.role)) return jsonError('Forbidden', 403)

    const body = await request.json()
    const name = sanitizeText(body?.name || '')
    if (!name) return jsonError('Channel name is required')

    const existingCount = await prisma.chatChannel.count({ where: { clerkOrgId: orgId } })
    const channel = await prisma.chatChannel.create({
      data: {
        clerkOrgId: orgId,
        name,
        slug: slugifyChatName(body?.slug || name),
        description: sanitizeText(body?.description || '') || null,
        type: body?.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'TEXT',
        createdByUserId: user.id,
        position: Number.isFinite(body?.position) ? Number(body.position) : existingCount,
      },
    })

    await publishAblyEvent(getChatOrgMetaChannelName(orgId), CHAT_EVENTS.CHANNEL_CREATED, {
      orgId,
      channelId: channel.id,
    })

    return NextResponse.json({ channel })
  } catch (error) {
    console.error('Error creating channel:', error)
    if (error instanceof Error && error.message === 'Forbidden') return jsonError('Forbidden', 403)
    return jsonError('Internal server error', 500)
  }
}
