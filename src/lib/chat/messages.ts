import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'
import { buildMessageMetadata } from './queries'

const MAX_MESSAGE_LENGTH = 4000

function roomFilter(input: { roomType: 'ORG_CHANNEL' | 'DIRECT_MESSAGE'; channelId?: string | null; dmConversationId?: string | null }) {
  return input.roomType === 'ORG_CHANNEL'
    ? { channelId: input.channelId, dmConversationId: null }
    : { channelId: null, dmConversationId: input.dmConversationId }
}

export async function resolveThreadState(input: {
  roomType: 'ORG_CHANNEL' | 'DIRECT_MESSAGE'
  channelId?: string | null
  dmConversationId?: string | null
  replyToMessageId?: string | null
  threadRootMessageId?: string | null
}) {
  let replyToMessageId = input.replyToMessageId ?? null
  let threadRootMessageId = input.threadRootMessageId ?? null

  if (!replyToMessageId && !threadRootMessageId) {
    return { replyToMessageId: null, threadRootMessageId: null }
  }

  const room = roomFilter(input)
  const idsToCheck = [replyToMessageId, threadRootMessageId].filter(Boolean) as string[]
  const messages = await prisma.chatMessage.findMany({
    where: {
      id: { in: idsToCheck },
      ...room,
    },
  })
  const byId = new Map(messages.map((message) => [message.id, message]))

  if (replyToMessageId && !byId.has(replyToMessageId)) {
    throw new Error('Reply target not found')
  }

  if (threadRootMessageId && !byId.has(threadRootMessageId)) {
    throw new Error('Thread root not found')
  }

  if (replyToMessageId) {
    const replyTarget = byId.get(replyToMessageId)!
    threadRootMessageId = replyTarget.threadRootMessageId ?? replyTarget.id
  }

  if (!replyToMessageId && threadRootMessageId) {
    replyToMessageId = threadRootMessageId
  }

  if (replyToMessageId && threadRootMessageId && replyToMessageId === threadRootMessageId) {
    return { replyToMessageId, threadRootMessageId }
  }

  if (replyToMessageId && threadRootMessageId) {
    const replyTarget = byId.get(replyToMessageId)
    const expectedRoot = replyTarget?.threadRootMessageId ?? replyTarget?.id
    if (expectedRoot !== threadRootMessageId) {
      throw new Error('Reply and thread root do not match')
    }
  }

  return { replyToMessageId, threadRootMessageId }
}

export async function createChatMessage(input: {
  roomType: 'ORG_CHANNEL' | 'DIRECT_MESSAGE'
  channelId?: string | null
  dmConversationId?: string | null
  authorUserId: string
  content: string
  replyToMessageId?: string | null
  threadRootMessageId?: string | null
}) {
  const sanitizedContent = sanitizeText(input.content || '')
  if (!sanitizedContent.trim()) {
    throw new Error('Message content is required')
  }
  if (sanitizedContent.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message content must be ${MAX_MESSAGE_LENGTH} characters or fewer`)
  }

  const threadState = await resolveThreadState(input)
  const metadata = await buildMessageMetadata(sanitizedContent)

  return prisma.chatMessage.create({
    data: {
      roomType: input.roomType,
      channelId: input.channelId ?? null,
      dmConversationId: input.dmConversationId ?? null,
      authorUserId: input.authorUserId,
      content: sanitizedContent,
      replyToMessageId: threadState.replyToMessageId,
      threadRootMessageId: threadState.threadRootMessageId,
      metadata,
    },
  })
}

export function getMessagePreview(message: { deletedAt?: Date | null; content: string }) {
  return message.deletedAt ? 'Message deleted' : message.content
}
