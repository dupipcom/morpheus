import { createHash } from 'node:crypto'
import nodemailer from 'nodemailer'
import prisma from '@/lib/prisma'
import { defaultLocale } from '@/app/constants'
import { getRoomKey } from './unread'
import type { StoredProfileData } from './types'

const NOT_DELETED_FILTER = {
  OR: [
    { deletedAt: null as Date | null },
    { deletedAt: { isSet: false } },
  ],
}

const UNREAD_CHAT_MESSAGE_NOTIFICATION = 'UNREAD_CHAT_MESSAGE'
const UNREAD_CHAT_BATCH_NOTIFICATION = 'UNREAD_CHAT_BATCH'
// Pending reservations older than 2 hours are treated as abandoned so future hourly runs can retry them.
const STALE_PENDING_NOTIFICATION_MS = 2 * 60 * 60 * 1000

export type UnreadChatEmailMessage = {
  id: string
  senderDisplayName: string
  senderUsername: string | null
  senderAvatarUrl: string | null
  sentAt: Date
  roomLabel: string
}

type ChatEmailRecipient = {
  id: string
  email: string
}

type PreparedUnreadChatBatch = {
  recipient: ChatEmailRecipient
  batchScopeKey: string
  reservedMessageScopeKeys: string[]
  messages: UnreadChatEmailMessage[]
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getProfileDisplayName(profile: StoredProfileData | null | undefined) {
  const username = profile?.username?.value ?? null
  const firstName = profile?.firstName?.value ?? null
  const lastName = profile?.lastName?.value ?? null
  return [firstName, lastName].filter(Boolean).join(' ') || (username ? `@${username}` : 'Someone')
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  ).replace(/\/+$/, '')
}

function getChatUrl() {
  return `${getBaseUrl()}/${defaultLocale}/app/chat`
}

function getFromAddress() {
  const fromEmail = process.env.BREVO_SMTP_FROM_EMAIL?.trim()
  if (!fromEmail) {
    throw new Error('Missing BREVO_SMTP_FROM_EMAIL')
  }

  const fromName = process.env.BREVO_SMTP_FROM_NAME?.trim() || 'Dupip'
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail
}

function createMailTransport() {
  const user = process.env.BREVO_SMTP_USER?.trim()
  const pass = process.env.BREVO_SMTP_PASS?.trim()

  if (!user || !pass) {
    throw new Error('Missing Brevo SMTP credentials')
  }

  const host = process.env.BREVO_SMTP_HOST?.trim() || 'smtp-relay.brevo.com'
  const port = Number(process.env.BREVO_SMTP_PORT || '587')

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

function createNotificationScopeKey(type: string, key: string) {
  return `${type}:${key}`
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

function formatNotificationTimestamp(sentAt: Date) {
  return `${sentAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })} · ${sentAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })} UTC`
}

export function createUnreadChatBatchKey(messageIds: string[]) {
  return createHash('sha256').update(messageIds.slice().sort().join('|')).digest('hex')
}

export function filterAlreadyNotifiedMessages<T extends { id: string }>(
  messages: T[],
  notifiedMessageIds: Iterable<string>,
) {
  const notifiedIds = new Set(notifiedMessageIds)
  return messages.filter((message) => !notifiedIds.has(message.id))
}

export function buildUnreadChatEmailSubject(messageCount: number) {
  return messageCount === 1
    ? 'You have 1 unread Dupip chat message'
    : `You have ${messageCount} unread Dupip chat messages`
}

export function buildUnreadChatEmailText(messages: UnreadChatEmailMessage[], chatUrl: string) {
  const lines = messages.map((message) => {
    const sender = message.senderUsername ? `@${message.senderUsername}` : message.senderDisplayName
    return `• ${sender} · ${message.roomLabel} · ${formatNotificationTimestamp(message.sentAt)}`
  })

  return [
    buildUnreadChatEmailSubject(messages.length),
    '',
    ...lines,
    '',
    `Open chat: ${chatUrl}`,
    '',
    'This automated Dupip email intentionally omits message contents for privacy.',
  ].join('\n')
}

export function buildUnreadChatEmailHtml(messages: UnreadChatEmailMessage[], chatUrl: string) {
  const rows = messages
    .map((message) => {
      const senderLabel = escapeHtml(message.senderUsername ? `@${message.senderUsername}` : message.senderDisplayName)
      const roomLabel = escapeHtml(message.roomLabel)
      const timeLabel = escapeHtml(formatNotificationTimestamp(message.sentAt))
      const avatar = message.senderAvatarUrl
        ? `<img src="${escapeHtml(message.senderAvatarUrl)}" alt="${senderLabel} avatar" width="44" height="44" style="display:block; width:44px; height:44px; border-radius:22px; border:2px solid #ff6a9e; object-fit:cover;" />`
        : `<div style="width:44px; height:44px; border-radius:22px; border:2px solid #ff6a9e; background:#ffe5fc; color:#563769; font-size:18px; font-weight:700; line-height:40px; text-align:center;">${escapeHtml((message.senderDisplayName?.charAt(0) || '?').toUpperCase())}</div>`

      return `
        <tr>
          <td style="padding:0 0 18px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; background:#ffffff; border:1px solid #c4abef; border-radius:12px;">
              <tr>
                <td style="padding:16px 18px; width:44px; vertical-align:top;">${avatar}</td>
                <td style="padding:16px 18px 16px 0; vertical-align:top;">
                  <div style="font-size:16px; line-height:22px; font-weight:700; color:#3e365c;">${senderLabel}</div>
                  <div style="font-size:14px; line-height:20px; color:#2f2f8d; margin-top:4px;">Unread message waiting in ${roomLabel}</div>
                  <div style="font-size:12px; line-height:18px; color:#ff6a9e; margin-top:6px;">${timeLabel}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
    })
    .join('')

  return `
    <html>
      <body style="margin:0; padding:24px 12px; background:#f1cfff; color:#2f2f8d; font-family:Arial, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; border-collapse:collapse; background:#ffffff; border:4px solid #c4abef; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="padding:20px 32px; background:#563769; color:#ffe5fc;">
                    <div style="font-size:24px; font-weight:700; line-height:30px;">You&#39;ve got unread chats ✨</div>
                    <div style="font-size:14px; line-height:20px; margin-top:8px; color:#f1cfff;">Dupip collected your latest unread chat activity in one privacy-friendly summary.</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 32px 12px 32px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      ${rows}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 32px 24px 32px;">
                    <a href="${escapeHtml(chatUrl)}" style="display:inline-block; background:#2f2f8d; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; line-height:20px; padding:12px 18px; border-radius:999px;">Open Dupip chat</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 32px; background:#ffe5fc; color:#563769; font-size:13px; line-height:18px;">
                    This is an automated message from Dupip. For privacy, message contents are not included in this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

function mapSenderProfiles(
  users: Array<{ id: string; userId: string | null }>,
  profiles: Array<{ userId: string; data: unknown }>,
) {
  const profileByUserId = new Map<string, StoredProfileData | null>()
  for (const profile of profiles) {
    profileByUserId.set(profile.userId, (profile.data as StoredProfileData | null) ?? null)
  }

  return new Map(
    users.map((user) => {
      const profile = profileByUserId.get(user.id)
      return [
        user.id,
        {
          senderDisplayName: getProfileDisplayName(profile),
          senderUsername: profile?.username?.value ?? null,
          senderAvatarUrl: profile?.profilePicture?.value ?? null,
        },
      ]
    }),
  )
}

async function listUnreadMessagesForUser(userId: string) {
  const memberships = await prisma.chatOrgMembership.findMany({
    where: { userId },
    select: { clerkOrgId: true },
  })

  const [channels, conversations, readStates] = await Promise.all([
    prisma.chatChannel.findMany({
      where: {
        archived: false,
        clerkOrgId: { in: memberships.map((membership) => membership.clerkOrgId) },
      },
      select: { id: true, name: true },
    }),
    prisma.directMessageConversation.findMany({
      where: { participantUserIds: { has: userId } },
      select: { id: true },
    }),
    prisma.chatReadState.findMany({
      where: { userId },
      select: {
        roomKey: true,
        lastReadAt: true,
      },
    }),
  ])

  const readStateByRoomKey = new Map(readStates.map((state) => [state.roomKey, state.lastReadAt ?? null]))
  const channelNameById = new Map(channels.map((channel) => [channel.id, `#${channel.name}`]))
  const roomMessages = await Promise.all([
    ...channels.map((channel) =>
      prisma.chatMessage.findMany({
        where: {
          channelId: channel.id,
          authorUserId: { not: userId },
          ...(readStateByRoomKey.get(getRoomKey({ channelId: channel.id }))
            ? { createdAt: { gt: readStateByRoomKey.get(getRoomKey({ channelId: channel.id }))! } }
            : {}),
          ...NOT_DELETED_FILTER,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          roomType: true,
          channelId: true,
          dmConversationId: true,
          authorUserId: true,
          createdAt: true,
        },
      }),
    ),
    ...conversations.map((conversation) =>
      prisma.chatMessage.findMany({
        where: {
          dmConversationId: conversation.id,
          authorUserId: { not: userId },
          ...(readStateByRoomKey.get(getRoomKey({ dmConversationId: conversation.id }))
            ? { createdAt: { gt: readStateByRoomKey.get(getRoomKey({ dmConversationId: conversation.id }))! } }
            : {}),
          ...NOT_DELETED_FILTER,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          roomType: true,
          channelId: true,
          dmConversationId: true,
          authorUserId: true,
          createdAt: true,
        },
      }),
    ),
  ])

  const candidates = roomMessages.flat().sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  if (candidates.length === 0) return []

  const existingNotifications = await prisma.emailNotification.findMany({
    where: {
      recipientUserId: userId,
      type: UNREAD_CHAT_MESSAGE_NOTIFICATION,
      chatMessageId: { in: candidates.map((candidate) => candidate.id) },
    },
    select: { chatMessageId: true },
  })

  const pendingMessages = filterAlreadyNotifiedMessages(
    candidates,
    existingNotifications.flatMap((notification) => (notification.chatMessageId ? [notification.chatMessageId] : [])),
  )

  if (pendingMessages.length === 0) return []

  const senderIds = [...new Set(pendingMessages.map((message) => message.authorUserId))]
  const [users, profiles] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, userId: true },
    }),
    prisma.profile.findMany({
      where: { userId: { in: senderIds } },
      select: { userId: true, data: true },
    }),
  ])

  const senders = mapSenderProfiles(users, profiles)

  return pendingMessages.map((message) => {
    const sender = senders.get(message.authorUserId)

    return {
      id: message.id,
      senderDisplayName: sender?.senderDisplayName ?? 'Someone',
      senderUsername: sender?.senderUsername ?? null,
      senderAvatarUrl: sender?.senderAvatarUrl ?? null,
      sentAt: message.createdAt,
      roomLabel: message.roomType === 'ORG_CHANNEL'
        ? (message.channelId ? channelNameById.get(message.channelId) ?? 'a channel' : 'a channel')
        : 'a direct message',
    } satisfies UnreadChatEmailMessage
  })
}

async function cleanupStalePendingNotifications() {
  const cutoff = new Date(Date.now() - STALE_PENDING_NOTIFICATION_MS)
  await prisma.emailNotification.deleteMany({
    where: {
      sentAt: null,
      createdAt: { lt: cutoff },
      type: { in: [UNREAD_CHAT_BATCH_NOTIFICATION, UNREAD_CHAT_MESSAGE_NOTIFICATION] },
    },
  })
}

async function reserveUnreadChatBatch(recipient: ChatEmailRecipient, messages: UnreadChatEmailMessage[]) {
  if (messages.length === 0) {
    return null
  }

  const batchKey = createUnreadChatBatchKey(messages.map((message) => message.id))
  const batchScopeKey = createNotificationScopeKey(UNREAD_CHAT_BATCH_NOTIFICATION, batchKey)

  try {
    await prisma.emailNotification.create({
      data: {
        type: UNREAD_CHAT_BATCH_NOTIFICATION,
        scopeKey: batchScopeKey,
        recipientUserId: recipient.id,
        payload: {
          messageIds: messages.map((message) => message.id),
        },
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return null
    }

    throw error
  }

  const reservedMessageScopeKeys: string[] = []

  try {
    for (const message of messages) {
      const scopeKey = createNotificationScopeKey(UNREAD_CHAT_MESSAGE_NOTIFICATION, message.id)

      await prisma.emailNotification.create({
        data: {
          type: UNREAD_CHAT_MESSAGE_NOTIFICATION,
          scopeKey,
          recipientUserId: recipient.id,
          chatMessageId: message.id,
          payload: {
            batchKey,
            roomLabel: message.roomLabel,
          },
        },
      })

      reservedMessageScopeKeys.push(scopeKey)
    }
  } catch (error) {
    await prisma.emailNotification.deleteMany({
      where: {
        recipientUserId: recipient.id,
        sentAt: null,
        OR: [
          { scopeKey: batchScopeKey },
          { scopeKey: { in: reservedMessageScopeKeys } },
        ],
      },
    })

    if (isUniqueConstraintError(error)) {
      return null
    }

    throw error
  }

  if (reservedMessageScopeKeys.length !== messages.length) {
    await prisma.emailNotification.deleteMany({
      where: {
        recipientUserId: recipient.id,
        sentAt: null,
        OR: [
          { scopeKey: batchScopeKey },
          { scopeKey: { in: reservedMessageScopeKeys } },
        ],
      },
    })
    return null
  }

  return {
    recipient,
    batchScopeKey,
    reservedMessageScopeKeys,
    messages,
  } satisfies PreparedUnreadChatBatch
}

async function listChatNotificationRecipients() {
  const [memberships, conversations] = await Promise.all([
    prisma.chatOrgMembership.findMany({ select: { userId: true } }),
    prisma.directMessageConversation.findMany({ select: { participantUserIds: true } }),
  ])

  const candidateUserIds = [...new Set([
    ...memberships.map((membership) => membership.userId),
    ...conversations.flatMap((conversation) => conversation.participantUserIds),
  ])]

  if (candidateUserIds.length === 0) {
    return []
  }

  return prisma.user.findMany({
    where: {
      id: { in: candidateUserIds },
      email: { not: null },
    },
    select: { id: true, email: true },
  }).then((users) =>
    users.flatMap((user) => (user.email ? [{ id: user.id, email: user.email }] : [])),
  )
}

async function markUnreadChatBatchSent(batch: PreparedUnreadChatBatch) {
  const sentAt = new Date()

  await prisma.emailNotification.updateMany({
    where: {
      recipientUserId: batch.recipient.id,
      sentAt: null,
      OR: [
        { scopeKey: batch.batchScopeKey },
        { scopeKey: { in: batch.reservedMessageScopeKeys } },
      ],
    },
    data: { sentAt },
  })
}

async function releaseUnreadChatBatch(batch: PreparedUnreadChatBatch) {
  await prisma.emailNotification.deleteMany({
    where: {
      recipientUserId: batch.recipient.id,
      sentAt: null,
      OR: [
        { scopeKey: batch.batchScopeKey },
        { scopeKey: { in: batch.reservedMessageScopeKeys } },
      ],
    },
  })
}

async function prepareUnreadChatBatchForRecipient(recipient: ChatEmailRecipient) {
  const messages = await listUnreadMessagesForUser(recipient.id)
  if (messages.length === 0) {
    return null
  }

  return reserveUnreadChatBatch(recipient, messages)
}

export function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    return false
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  return request.headers.get('x-cron-secret') === cronSecret
}

export async function processUnreadChatEmailNotifications() {
  await cleanupStalePendingNotifications()

  const recipients = await listChatNotificationRecipients()
  if (recipients.length === 0) {
    return {
      processedRecipients: 0,
      sentEmails: 0,
      reservedMessages: 0,
    }
  }

  const transport = createMailTransport()
  const from = getFromAddress()
  const chatUrl = getChatUrl()

  let sentEmails = 0
  let reservedMessages = 0

  for (const recipient of recipients) {
    const batch = await prepareUnreadChatBatchForRecipient(recipient)
    if (!batch || batch.messages.length === 0) {
      continue
    }

    try {
      await transport.sendMail({
        from,
        to: recipient.email,
        subject: buildUnreadChatEmailSubject(batch.messages.length),
        text: buildUnreadChatEmailText(batch.messages, chatUrl),
        html: buildUnreadChatEmailHtml(batch.messages, chatUrl),
      })

      await markUnreadChatBatchSent(batch)
      sentEmails += 1
      reservedMessages += batch.messages.length
    } catch (error) {
      console.error('Failed to send unread chat summary email:', {
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        messageIds: batch.messages.map((message) => message.id),
        error,
      })
      await releaseUnreadChatBatch(batch)
      throw error
    }
  }

  return {
    processedRecipients: recipients.length,
    sentEmails,
    reservedMessages,
  }
}
