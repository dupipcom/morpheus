import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUnreadCount } from './queries'
import { publishAblyEvent } from './realtime/ablyServer'
import { CHAT_EVENTS } from './realtime/events'
import {
  getChatDmChannelName,
  getChatOrgChannelName,
  getChatOrgMetaChannelName,
  getChatUserChannelName,
} from './realtime/channelNames'

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}


export function chatErrorResponse(
  error: unknown,
  statusByMessage: Record<string, number>,
  fallbackMessage = 'Internal server error',
  fallbackStatus = 500,
) {
  if (error instanceof Error && statusByMessage[error.message]) {
    return jsonError(error.message, statusByMessage[error.message])
  }

  return jsonError(fallbackMessage, fallbackStatus)
}

export function slugifyChatName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'room'
}

export async function publishUserInvalidation(userIds: string[], payload: Record<string, unknown>) {
  await Promise.all(
    [...new Set(userIds)].map(async (userId) => {
      const unreadCount = await getUnreadCount(userId).catch(() => 0)
      await publishAblyEvent(getChatUserChannelName(userId), CHAT_EVENTS.ROOM_UNREAD_CHANGED, {
        ...payload,
        unreadCount,
      })
    }),
  )
}

export async function publishChannelMutation(orgId: string, channelId: string, eventName: string, payload: Record<string, unknown>) {
  await Promise.all([
    publishAblyEvent(getChatOrgMetaChannelName(orgId), eventName, payload),
    publishAblyEvent(getChatOrgChannelName(orgId, channelId), eventName, payload),
  ])
}

export async function publishMessageCreated(input: {
  orgId?: string
  channelId?: string | null
  dmConversationId?: string | null
  messageId: string
  participantUserIds: string[]
  threadReply: boolean
}) {
  const eventName = input.threadReply ? CHAT_EVENTS.THREAD_REPLY_CREATED : CHAT_EVENTS.MESSAGE_CREATED

  if (input.orgId && input.channelId) {
    await Promise.all([
      publishAblyEvent(getChatOrgChannelName(input.orgId, input.channelId), eventName, {
        channelId: input.channelId,
        messageId: input.messageId,
      }),
      publishAblyEvent(getChatOrgMetaChannelName(input.orgId), CHAT_EVENTS.ROOM_UNREAD_CHANGED, {
        channelId: input.channelId,
        messageId: input.messageId,
      }),
    ])
  }

  if (input.dmConversationId) {
    await publishAblyEvent(getChatDmChannelName(input.dmConversationId), eventName, {
      dmConversationId: input.dmConversationId,
      messageId: input.messageId,
    })
  }

  await publishUserInvalidation(input.participantUserIds, {
    channelId: input.channelId,
    dmConversationId: input.dmConversationId,
    messageId: input.messageId,
  })
}

export async function publishMessageDeleted(input: {
  orgId?: string
  channelId?: string | null
  dmConversationId?: string | null
  messageId: string
  participantUserIds: string[]
}) {
  if (input.orgId && input.channelId) {
    await publishChannelMutation(input.orgId, input.channelId, CHAT_EVENTS.MESSAGE_DELETED, {
      channelId: input.channelId,
      messageId: input.messageId,
    })
  }

  if (input.dmConversationId) {
    await publishAblyEvent(getChatDmChannelName(input.dmConversationId), CHAT_EVENTS.MESSAGE_DELETED, {
      dmConversationId: input.dmConversationId,
      messageId: input.messageId,
    })
  }

  await publishUserInvalidation(input.participantUserIds, {
    channelId: input.channelId,
    dmConversationId: input.dmConversationId,
    messageId: input.messageId,
  })
}

export async function getOrgMemberIds(orgId: string) {
  const memberships = await prisma.chatOrgMembership.findMany({
    where: { clerkOrgId: orgId },
    select: { userId: true },
  })

  return memberships.map((membership) => membership.userId)
}
