import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureChannelAccess, ensureDmParticipant, getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError, publishUserInvalidation } from '@/lib/chat/api'
import { getRoomKey } from '@/lib/chat/unread'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { getChatUserChannelName } from '@/lib/chat/realtime/channelNames'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const body = await request.json()
    const channelId = body?.channelId ? String(body.channelId) : null
    const dmConversationId = body?.dmConversationId ? String(body.dmConversationId) : null
    const lastReadMessageId = body?.lastReadMessageId ? String(body.lastReadMessageId) : null

    if (!channelId && !dmConversationId) {
      return jsonError('channelId or dmConversationId is required')
    }

    if (channelId) {
      await ensureChannelAccess(channelId, user.id)
    }

    if (dmConversationId) {
      await ensureDmParticipant(dmConversationId, user.id)
    }

    const lastReadMessage = lastReadMessageId
      ? await prisma.chatMessage.findUnique({ where: { id: lastReadMessageId }, select: { createdAt: true } })
      : null

    const readState = await prisma.chatReadState.upsert({
      where: {
        userId_roomKey: {
          userId: user.id,
          roomKey: getRoomKey({ channelId, dmConversationId }),
        },
      },
      update: {
        channelId,
        dmConversationId,
        lastReadMessageId,
        lastReadAt: lastReadMessage?.createdAt ?? new Date(),
      },
      create: {
        userId: user.id,
        roomKey: getRoomKey({ channelId, dmConversationId }),
        channelId,
        dmConversationId,
        lastReadMessageId,
        lastReadAt: lastReadMessage?.createdAt ?? new Date(),
      },
    })

    await Promise.all([
      publishAblyEvent(getChatUserChannelName(user.id), CHAT_EVENTS.ROOM_READ, {
        channelId,
        dmConversationId,
        lastReadMessageId,
      }),
      publishUserInvalidation([user.id], { channelId, dmConversationId, lastReadMessageId }),
    ])

    return NextResponse.json({ readState })
  } catch (error) {
    console.error('Error updating read state:', error)
    return jsonError(error instanceof Error && error.message === 'Forbidden' ? 'Forbidden' : 'Internal server error', error instanceof Error && error.message === 'Forbidden' ? 403 : 500)
  }
}
