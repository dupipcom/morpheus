import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ensureChannelAccess, ensureDmParticipant, getCurrentChatUser, getUserChatRole } from '@/lib/chat/auth'
import { buildMessageMetadata } from '@/lib/chat/queries'
import { canDeleteMessage } from '@/lib/chat/permissions'
import { sanitizeText } from '@/lib/utils/sanitize'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { getChatDmChannelName, getChatOrgChannelName } from '@/lib/chat/realtime/channelNames'
import { chatErrorResponse, getOrgMemberIds, jsonError, publishMessageDeleted, publishUserInvalidation } from '@/lib/chat/api'
import { CHAT_DELETED_MESSAGE_MARKER } from '@/lib/chat/constants'

const MESSAGE_ERROR_STATUS: Record<string, number> = {
  'Message not found': 404,
  'Channel not found': 404,
  'Conversation not found': 404,
  Forbidden: 403,
}

async function getMessageContext(messageId: string, currentUserId: string) {
  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } })
  if (!message) {
    throw new Error('Message not found')
  }

  if (message.channelId) {
    const channel = await ensureChannelAccess(message.channelId, currentUserId)
    const participantUserIds = await getOrgMemberIds(channel.clerkOrgId)
    return {
      message,
      participantUserIds,
      orgId: channel.clerkOrgId,
      channelId: channel.id,
      dmConversationId: null,
      role: await getUserChatRole(channel.clerkOrgId, currentUserId),
    }
  }

  if (!message.dmConversationId) {
    throw new Error('Message room is invalid')
  }

  const conversation = await ensureDmParticipant(message.dmConversationId, currentUserId)
  return {
    message,
    participantUserIds: conversation.participantUserIds,
    orgId: null,
    channelId: null,
    dmConversationId: conversation.id,
    role: null,
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { messageId } = await params
    const context = await getMessageContext(messageId, user.id)
    if (context.message.authorUserId !== user.id) {
      return jsonError('Forbidden', 403)
    }

    const body = await request.json()
    const content = sanitizeText(body?.content || '')
    if (!content) return jsonError('Message content is required')

    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content,
        metadata: await buildMessageMetadata(content),
        editedAt: new Date(),
      },
    })

    if (context.orgId && context.channelId) {
      await publishAblyEvent(getChatOrgChannelName(context.orgId, context.channelId), CHAT_EVENTS.MESSAGE_UPDATED, {
        messageId,
        channelId: context.channelId,
      })
    }

    if (context.dmConversationId) {
      await publishAblyEvent(getChatDmChannelName(context.dmConversationId), CHAT_EVENTS.MESSAGE_UPDATED, {
        messageId,
        dmConversationId: context.dmConversationId,
      })
    }

    await publishUserInvalidation(context.participantUserIds, {
      messageId,
      channelId: context.channelId,
      dmConversationId: context.dmConversationId,
    })

    return NextResponse.json({ message: updated })
  } catch (error) {
    console.error('Error updating chat message:', error)
    return chatErrorResponse(error, MESSAGE_ERROR_STATUS)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const user = await getCurrentChatUser()
    if (!user) return jsonError('Unauthorized', 401)

    const { messageId } = await params
    const context = await getMessageContext(messageId, user.id)
    if (!canDeleteMessage(context.role, context.message.authorUserId, user.id)) {
      return jsonError('Forbidden', 403)
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        deletedByUserId: user.id,
        content: CHAT_DELETED_MESSAGE_MARKER,
      },
    })

    await publishMessageDeleted({
      orgId: context.orgId ?? undefined,
      channelId: context.channelId,
      dmConversationId: context.dmConversationId,
      messageId,
      participantUserIds: context.participantUserIds,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting chat message:', error)
    return chatErrorResponse(error, MESSAGE_ERROR_STATUS)
  }
}
