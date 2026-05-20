import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canStartDirectMessage, getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError, publishUserInvalidation } from '@/lib/chat/api'
import { getChatSidebar } from '@/lib/chat/queries'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { getChatUserChannelName } from '@/lib/chat/realtime/channelNames'

function getConversationKey(userIds: string[]) {
  return [...userIds].sort().join(':')
}

export async function GET() {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const sidebar = await getChatSidebar(user.id)
    return NextResponse.json({ conversations: sidebar.dms })
  } catch (error) {
    console.error('Error listing dms:', error)
    return jsonError('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const body = await request.json()
    const participantUserId = String(body?.participantUserId || '')
    if (!participantUserId) return jsonError('participantUserId is required')

    const canStart = await canStartDirectMessage(user.id, participantUserId)
    if (!canStart) return jsonError('Direct messages are limited to friends and close friends', 403)

    const conversationKey = getConversationKey([user.id, participantUserId])
    let conversation = await prisma.directMessageConversation.findUnique({ where: { conversationKey } })

    if (!conversation) {
      conversation = await prisma.directMessageConversation.create({
        data: {
          participantUserIds: [user.id, participantUserId],
          conversationKey,
          createdByUserId: user.id,
        },
      })

      await Promise.all([
        publishAblyEvent(getChatUserChannelName(user.id), CHAT_EVENTS.DM_CREATED, { conversationId: conversation.id }),
        publishAblyEvent(getChatUserChannelName(participantUserId), CHAT_EVENTS.DM_CREATED, { conversationId: conversation.id }),
      ])
    }

    await publishUserInvalidation([user.id, participantUserId], { dmConversationId: conversation.id })
    return NextResponse.json({ conversation })
  } catch (error) {
    console.error('Error creating dm:', error)
    return jsonError('Internal server error', 500)
  }
}
