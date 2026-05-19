import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureDmParticipant, getCurrentChatUser } from '@/lib/chat/auth'
import { jsonError, publishMessageCreated } from '@/lib/chat/api'
import { listDmMessages } from '@/lib/chat/queries'
import { createChatMessage } from '@/lib/chat/messages'
import { getRoomKey } from '@/lib/chat/unread'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { conversationId } = await params
    await ensureDmParticipant(conversationId, user.id)

    const limit = Number(request.nextUrl.searchParams.get('limit') || '50')
    const messages = await listDmMessages(conversationId, Math.min(Math.max(limit, 1), 100))

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Error listing dm messages:', error)
    return jsonError(error instanceof Error && error.message === 'Conversation not found' ? 'Conversation not found' : error instanceof Error && error.message === 'Forbidden' ? 'Forbidden' : 'Internal server error', error instanceof Error && error.message === 'Conversation not found' ? 404 : error instanceof Error && error.message === 'Forbidden' ? 403 : 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { conversationId } = await params
    const conversation = await ensureDmParticipant(conversationId, user.id)
    const body = await request.json()

    const message = await createChatMessage({
      roomType: 'DIRECT_MESSAGE',
      dmConversationId: conversationId,
      authorUserId: user.id,
      content: body?.content || '',
      replyToMessageId: body?.replyToMessageId || null,
      threadRootMessageId: body?.threadRootMessageId || null,
    })

    await Promise.all([
      prisma.directMessageConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.createdAt },
      }),
      prisma.chatReadState.upsert({
        where: {
          userId_roomKey: {
            userId: user.id,
            roomKey: getRoomKey({ dmConversationId: conversationId }),
          },
        },
        update: {
          dmConversationId: conversationId,
          channelId: null,
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt,
        },
        create: {
          userId: user.id,
          roomKey: getRoomKey({ dmConversationId: conversationId }),
          dmConversationId: conversationId,
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt,
        },
      }),
    ])

    await publishMessageCreated({
      dmConversationId: conversationId,
      messageId: message.id,
      participantUserIds: conversation.participantUserIds,
      threadReply: Boolean(message.threadRootMessageId),
    })

    return NextResponse.json({ messageId: message.id }, { status: 201 })
  } catch (error) {
    console.error('Error creating dm message:', error)
    return jsonError(error instanceof Error ? error.message : 'Internal server error', error instanceof Error && error.message === 'Conversation not found' ? 404 : error instanceof Error && error.message === 'Forbidden' ? 403 : 400)
  }
}
