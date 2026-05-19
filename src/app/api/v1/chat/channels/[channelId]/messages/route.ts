import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureChannelAccess, getCurrentChatUser } from '@/lib/chat/auth'
import { chatErrorResponse, getOrgMemberIds, jsonError, publishMessageCreated } from '@/lib/chat/api'
import { listChannelMessages } from '@/lib/chat/queries'
import { createChatMessage } from '@/lib/chat/messages'
import { getRoomKey } from '@/lib/chat/unread'

const CHANNEL_MESSAGE_ERROR_STATUS: Record<string, number> = {
  'Channel not found': 404,
  Forbidden: 403,
  'Message content is required': 400,
  'Reply target not found': 400,
  'Thread root not found': 400,
  'Reply and thread root do not match': 400,
  'Message content must be 4000 characters or fewer': 400,
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { channelId } = await params
    await ensureChannelAccess(channelId, user.id)

    const limit = Number(request.nextUrl.searchParams.get('limit') || '50')
    const messages = await listChannelMessages(channelId, Math.min(Math.max(limit, 1), 100))

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Error listing channel messages:', error)
    return chatErrorResponse(error, CHANNEL_MESSAGE_ERROR_STATUS)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { channelId } = await params
    const channel = await ensureChannelAccess(channelId, user.id)
    const body = await request.json()

    const message = await createChatMessage({
      roomType: 'ORG_CHANNEL',
      channelId,
      authorUserId: user.id,
      content: body?.content || '',
      replyToMessageId: body?.replyToMessageId || null,
      threadRootMessageId: body?.threadRootMessageId || null,
    })

    await prisma.chatReadState.upsert({
      where: {
        userId_roomKey: {
          userId: user.id,
          roomKey: getRoomKey({ channelId }),
        },
      },
      update: {
        channelId,
        dmConversationId: null,
        lastReadMessageId: message.id,
        lastReadAt: message.createdAt,
      },
      create: {
        userId: user.id,
        roomKey: getRoomKey({ channelId }),
        channelId,
        lastReadMessageId: message.id,
        lastReadAt: message.createdAt,
      },
    })

    await publishMessageCreated({
      orgId: channel.clerkOrgId,
      channelId,
      messageId: message.id,
      participantUserIds: await getOrgMemberIds(channel.clerkOrgId),
      threadReply: Boolean(message.threadRootMessageId),
    })

    return NextResponse.json({ messageId: message.id }, { status: 201 })
  } catch (error) {
    console.error('Error creating channel message:', error)
    return chatErrorResponse(error, CHANNEL_MESSAGE_ERROR_STATUS, 'Internal server error', 500)
  }
}
