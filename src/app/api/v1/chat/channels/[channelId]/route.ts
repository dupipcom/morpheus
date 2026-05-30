import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureChannelAccess, getCurrentChatUser, getUserChatRole } from '@/lib/chat/auth'
import { canManageChannels } from '@/lib/chat/permissions'
import { jsonError, slugifyChatName } from '@/lib/chat/api'
import { sanitizeText } from '@/lib/utils/sanitize'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { getChatOrgMetaChannelName } from '@/lib/chat/realtime/channelNames'

function getChannelErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'Channel not found') {
    return jsonError('Channel not found', 404)
  }

  if (error instanceof Error && error.message === 'Forbidden') {
    return jsonError('Forbidden', 403)
  }

  return jsonError('Internal server error', 500)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { channelId } = await params
    const channel = await ensureChannelAccess(channelId, user.id)
    const role = await getUserChatRole(channel.clerkOrgId, user.id)
    if (!canManageChannels(role)) return jsonError('Forbidden', 403)

    const body = await request.json()
    const nextName = body?.name ? sanitizeText(body.name) : undefined
    const updated = await prisma.chatChannel.update({
      where: { id: channelId },
      data: {
        ...(nextName ? { name: nextName, slug: slugifyChatName(body?.slug || nextName) } : {}),
        ...(body?.description !== undefined ? { description: sanitizeText(body.description) || null } : {}),
        ...(body?.position !== undefined ? { position: Number(body.position) || 0 } : {}),
        ...(body?.type === 'ANNOUNCEMENT' || body?.type === 'TEXT' ? { type: body.type } : {}),
      },
    })

    await publishAblyEvent(getChatOrgMetaChannelName(channel.clerkOrgId), CHAT_EVENTS.CHANNEL_UPDATED, {
      channelId,
      orgId: channel.clerkOrgId,
    })

    return NextResponse.json({ channel: updated })
  } catch (error) {
    console.error('Error updating channel:', error)
    return getChannelErrorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { channelId } = await params
    const channel = await ensureChannelAccess(channelId, user.id)
    const role = await getUserChatRole(channel.clerkOrgId, user.id)
    if (!canManageChannels(role)) return jsonError('Forbidden', 403)

    await prisma.chatChannel.update({
      where: { id: channelId },
      data: { archived: true },
    })

    await publishAblyEvent(getChatOrgMetaChannelName(channel.clerkOrgId), CHAT_EVENTS.CHANNEL_DELETED, {
      channelId,
      orgId: channel.clerkOrgId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error archiving channel:', error)
    return getChannelErrorResponse(error)
  }
}
