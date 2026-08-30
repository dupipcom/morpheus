/**
 * Telnyx webhook handler
 * Dispatches webhook_api_version "2" events: message.received (inbound),
 * message.sent / message.finalized (outbound delivery status).
 * Dedup on telnyxMessageId makes retries idempotent.
 */

import prisma from '@/lib/prisma'
import { publishUserInvalidation } from '@/lib/chat/api'
import { publishAblyEvent } from '@/lib/chat/realtime/ablyServer'
import { getChatSmsChannelName } from '@/lib/chat/realtime/channelNames'
import { CHAT_EVENTS } from '@/lib/chat/realtime/events'
import { sanitizeText } from '@/lib/utils/sanitize'

import { mapInboundSmsPayload, mapOutboundSmsStatus, shouldApplyOutboundStatus } from './helpers'
import { handleRecordingSaved } from '@/lib/services/voicemail/recordingHandler'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
}

export async function handleTelnyxWebhook(rawPayload: unknown): Promise<void> {
  if (!isRecord(rawPayload) || !isRecord(rawPayload.data)) return

  const data = rawPayload.data
  const eventType = typeof data.event_type === 'string' ? data.event_type : null
  const payload = isRecord(data.payload) ? data.payload : null
  if (!eventType || !payload) return

  if (eventType === 'message.received') {
    await handleInboundSms(payload)
  } else if (eventType === 'message.sent' || eventType === 'message.finalized') {
    await handleOutboundSmsStatus(payload)
  } else if (eventType === 'call.recording.saved') {
    // Voice call recordings (phase 12): attach audio + transcript to voicemails
    await handleRecordingSaved(payload)
  }
  // Unknown events are a no-op
}

async function handleInboundSms(payload: Record<string, unknown>): Promise<void> {
  const input = mapInboundSmsPayload(payload)
  if (!input) return

  const virtualNumber = await prisma.virtualNumber.findUnique({
    where: { phoneNumber: input.toPhoneNumber }
  })
  if (!virtualNumber || virtualNumber.messagingProfileId == null) return // number not assigned/enabled for any user — no-op

  const userId = virtualNumber.userId

  let conversation = await prisma.smsConversation.findUnique({
    where: { userId_counterpartPhoneNumber: { userId, counterpartPhoneNumber: input.fromPhoneNumber } }
  })
  if (!conversation) {
    try {
      conversation = await prisma.smsConversation.create({
        data: {
          userId,
          counterpartPhoneNumber: input.fromPhoneNumber,
          virtualNumberId: virtualNumber.id
        }
      })
    } catch (error) {
      // A concurrent inbound message created the conversation first — fetch it
      if (isUniqueViolation(error)) {
        conversation = await prisma.smsConversation.findUnique({
          where: { userId_counterpartPhoneNumber: { userId, counterpartPhoneNumber: input.fromPhoneNumber } }
        })
      } else {
        throw error
      }
    }
  }
  if (!conversation) return

  try {
    await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        userId,
        direction: 'INBOUND',
        fromPhoneNumber: input.fromPhoneNumber,
        toPhoneNumber: input.toPhoneNumber,
        text: sanitizeText(input.text),
        status: null,
        telnyxMessageId: input.telnyxMessageId
      }
    })
  } catch (error) {
    // Duplicate webhook delivery — message already stored
    if (isUniqueViolation(error)) return
    throw error
  }

  await prisma.smsConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() }
  })

  void Promise.allSettled([
    publishAblyEvent(getChatSmsChannelName(conversation.id), CHAT_EVENTS.SMS_MESSAGE_CREATED, {
      conversationId: conversation.id,
      messageId: input.telnyxMessageId
    }),
    publishUserInvalidation([userId], {
      smsConversationId: conversation.id,
      messageId: input.telnyxMessageId
    })
  ]).catch(() => {})
}

function extractToStatus(payload: Record<string, unknown>): unknown {
  const to = Array.isArray(payload.to) ? payload.to : []
  const firstTo = to.length > 0 && isRecord(to[0]) ? to[0] : null
  return firstTo ? firstTo.status : undefined
}

async function handleOutboundSmsStatus(payload: Record<string, unknown>): Promise<void> {
  const telnyxMessageId = typeof payload.id === 'string' ? payload.id : null
  if (!telnyxMessageId) return

  const incoming = mapOutboundSmsStatus(extractToStatus(payload))
  if (!incoming) return

  const existing = await prisma.smsMessage.findUnique({ where: { telnyxMessageId } })
  if (!existing || existing.direction !== 'OUTBOUND') return
  if (!shouldApplyOutboundStatus(existing.status, incoming)) return

  await prisma.smsMessage.update({
    where: { id: existing.id },
    data: { status: incoming }
  })

  void Promise.allSettled([
    publishAblyEvent(getChatSmsChannelName(existing.conversationId), CHAT_EVENTS.SMS_MESSAGE_UPDATED, {
      conversationId: existing.conversationId,
      messageId: existing.id
    }),
    publishUserInvalidation([existing.userId], {
      smsConversationId: existing.conversationId,
      messageId: existing.id
    })
  ]).catch(() => {})
}
