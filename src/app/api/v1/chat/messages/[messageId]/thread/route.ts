import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureChannelAccess, ensureDmParticipant, getCurrentChatUser } from '@/lib/chat/auth'
import { chatErrorResponse, jsonError } from '@/lib/chat/api'
import { getThread } from '@/lib/chat/queries'

const THREAD_ERROR_STATUS: Record<string, number> = {
  'Message not found': 404,
  Forbidden: 403,
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { messageId } = await params
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } })
    if (!message) return jsonError('Message not found', 404)

    if (message.channelId) {
      await ensureChannelAccess(message.channelId, user.id)
    } else if (message.dmConversationId) {
      await ensureDmParticipant(message.dmConversationId, user.id)
    } else {
      return jsonError('Message room is invalid', 400)
    }

    const thread = await getThread(messageId)
    return NextResponse.json(thread)
  } catch (error) {
    console.error('Error fetching thread:', error)
    return chatErrorResponse(error, THREAD_ERROR_STATUS)
  }
}
