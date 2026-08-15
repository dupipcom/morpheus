/**
 * SMS Service
 * Telnyx SMS conversations and messages for the premium `virtual_number` feature.
 * Read tracking lives on SmsConversation.lastReadAt (ChatReadState is chat-only).
 */

import prisma from '@/lib/prisma'
import { publishUserInvalidation } from '@/lib/chat/api'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { getChatSmsChannelName } from '@/lib/chat/realtime/channelNames'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { sanitizeText } from '@/lib/utils/sanitize'
import { sendTelnyxMessage } from '@/lib/services/virtual-number/telnyxClient'

import { mapOutboundSmsStatus, SMS_MAX_TEXT_LENGTH } from './helpers'
import { SmsError } from './types'
import type { SmsConversationSummary, SmsMessageSummary } from './types'

function publishSmsMessageEvent(
  conversationId: string,
  messageId: string,
  userId: string,
  eventName: string
): Promise<unknown> {
  return Promise.allSettled([
    publishAblyEvent(getChatSmsChannelName(conversationId), eventName, { conversationId, messageId }),
    publishUserInvalidation([userId], { smsConversationId: conversationId, messageId })
  ])
}

export async function listSmsConversations(userId: string): Promise<SmsConversationSummary[]> {
  const conversations = await prisma.smsConversation.findMany({
    where: { userId },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }]
  })

  return Promise.all(
    conversations.map(async (conversation) => {
      const [lastMessage, unreadCount] = await Promise.all([
        prisma.smsMessage.findFirst({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'desc' },
          select: { text: true }
        }),
        prisma.smsMessage.count({
          where: {
            conversationId: conversation.id,
            direction: 'INBOUND',
            ...(conversation.lastReadAt ? { createdAt: { gt: conversation.lastReadAt } } : {})
          }
        })
      ])

      return {
        id: conversation.id,
        counterpartPhoneNumber: conversation.counterpartPhoneNumber,
        lastMessageAt: conversation.lastMessageAt ? conversation.lastMessageAt.toISOString() : null,
        unreadCount,
        lastMessagePreview: lastMessage?.text ?? null
      }
    })
  )
}

export async function ensureSmsConversationOwnership(conversationId: string, userId: string) {
  const conversation = await prisma.smsConversation.findUnique({ where: { id: conversationId } })
  if (!conversation) {
    throw new SmsError('CONVERSATION_NOT_FOUND', 'SMS conversation not found')
  }
  if (conversation.userId !== userId) {
    throw new SmsError('FORBIDDEN', 'Not your SMS conversation')
  }
  return conversation
}

export async function listSmsMessages(
  conversationId: string,
  userId: string,
  limit = 50
): Promise<SmsMessageSummary[]> {
  await ensureSmsConversationOwnership(conversationId, userId)

  const messages = await prisma.smsMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit
  })

  return [...messages].reverse().map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    fromPhoneNumber: message.fromPhoneNumber,
    toPhoneNumber: message.toPhoneNumber,
    text: message.text,
    status: message.status,
    createdAt: message.createdAt.toISOString()
  }))
}

export async function sendSmsMessage(input: {
  userId: string
  conversationId: string
  content: string
}): Promise<{ messageId: string }> {
  const conversation = await ensureSmsConversationOwnership(input.conversationId, input.userId)

  const sanitizedContent = sanitizeText(input.content || '')
  if (!sanitizedContent.trim()) {
    throw new SmsError('MESSAGE_CONTENT_REQUIRED', 'Message content is required')
  }
  if (sanitizedContent.length > SMS_MAX_TEXT_LENGTH) {
    throw new SmsError('MESSAGE_TOO_LONG', `Message content must be ${SMS_MAX_TEXT_LENGTH} characters or fewer`)
  }

  // From-number: the number that received the inbound that opened this
  // conversation, else the user's first assigned number (backfilled lazily).
  let virtualNumber = conversation.virtualNumberId
    ? await prisma.virtualNumber.findUnique({
        where: { id: conversation.virtualNumberId },
        select: { id: true, phoneNumber: true }
      })
    : null

  if (!virtualNumber) {
    const first = await prisma.virtualNumber.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, phoneNumber: true }
    })
    if (!first) {
      throw new SmsError('NO_VIRTUAL_NUMBER', 'No virtual number assigned')
    }
    virtualNumber = first
    if (conversation.virtualNumberId !== first.id) {
      await prisma.smsConversation.update({
        where: { id: conversation.id },
        data: { virtualNumberId: first.id }
      })
    }
  }

  let result
  try {
    result = await sendTelnyxMessage({
      from: virtualNumber.phoneNumber,
      to: conversation.counterpartPhoneNumber,
      text: sanitizedContent
    })
  } catch (error) {
    console.error('[sms] Telnyx send failed:', error)
    throw new SmsError('TELNYX_SEND_FAILED', 'Could not send SMS')
  }

  const message = await prisma.smsMessage.create({
    data: {
      conversationId: conversation.id,
      userId: input.userId,
      direction: 'OUTBOUND',
      fromPhoneNumber: virtualNumber.phoneNumber,
      toPhoneNumber: conversation.counterpartPhoneNumber,
      text: sanitizedContent,
      status: mapOutboundSmsStatus(result.toStatus) ?? 'SENT',
      telnyxMessageId: result.id
    }
  })

  // Sender implicitly read their own sent message
  await prisma.smsConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt, lastReadAt: message.createdAt }
  })

  void publishSmsMessageEvent(conversation.id, message.id, input.userId, CHAT_EVENTS.SMS_MESSAGE_CREATED).catch(
    () => {}
  )

  return { messageId: message.id }
}

export async function markSmsConversationRead(input: {
  userId: string
  conversationId: string
  lastReadMessageId?: string | null
}): Promise<void> {
  const conversation = await ensureSmsConversationOwnership(input.conversationId, input.userId)

  let lastReadAt = new Date()
  if (input.lastReadMessageId) {
    const lastReadMessage = await prisma.smsMessage.findUnique({
      where: { id: input.lastReadMessageId }
    })
    if (lastReadMessage && lastReadMessage.conversationId === conversation.id) {
      lastReadAt = lastReadMessage.createdAt
    }
  }

  await prisma.smsConversation.update({
    where: { id: conversation.id },
    data: { lastReadAt }
  })

  // User-channel invalidation recomputes getUnreadCount, which now includes SMS
  void publishUserInvalidation([input.userId], { smsConversationId: conversation.id }).catch(() => {})
}
