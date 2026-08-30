import { createHash } from 'node:crypto'
import nodemailer from 'nodemailer'
import { clerkClient } from '@clerk/nextjs/server'
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
// Pending reservations older than 2 hours are treated as abandoned so future cron runs can retry them.
const STALE_PENDING_NOTIFICATION_MS = 2 * 60 * 60 * 1000
const UNREAD_CHAT_RENOTIFY_AFTER_MS = 3 * 24 * 60 * 60 * 1000

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

export function filterUnreadChatMessagesForRenotification<T extends { id: string }>(
  messages: T[],
  notifications: Array<{ chatMessageId: string | null; createdAt: Date; sentAt: Date | null }>,
  now = new Date(),
) {
  const renotifyCutoff = new Date(now.getTime() - UNREAD_CHAT_RENOTIFY_AFTER_MS)
  const stalePendingCutoff = new Date(now.getTime() - STALE_PENDING_NOTIFICATION_MS)
  const latestNotificationByMessageId = new Map<string, { createdAt: Date; sentAt: Date | null }>()

  for (const notification of notifications) {
    if (!notification.chatMessageId) {
      continue
    }

    const existingNotification = latestNotificationByMessageId.get(notification.chatMessageId)
    const notificationTimestamp = notification.sentAt?.getTime() ?? notification.createdAt.getTime()
    const existingTimestamp = existingNotification
      ? (existingNotification.sentAt?.getTime() ?? existingNotification.createdAt.getTime())
      : null

    if (existingTimestamp === null || notificationTimestamp > existingTimestamp) {
      latestNotificationByMessageId.set(notification.chatMessageId, notification)
    }
  }

  return messages.filter((message) => {
    const latestNotification = latestNotificationByMessageId.get(message.id)

    if (!latestNotification) {
      return true
    }

    if (latestNotification.sentAt === null) {
      return latestNotification.createdAt <= stalePendingCutoff
    }

    return latestNotification.sentAt <= renotifyCutoff
  })
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

  const footerLines = [
    '© 2012-2026 Dupip. All rights reserved.',
    'IVA IT02925300903',
    'REA 572763',
    'CNPJ 37.553.462/0001-46',
  ]

  return `
    <html>
      <body style="margin:0; padding:24px 12px; background:#f1cfff; color:#2f2f8d; font-family:Arial, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; border-collapse:collapse; background:#ffffff; border:4px solid #c4abef; border-radius:12px; overflow:hidden;">
                <tr>
                  <td align="center" style="padding:18px 32px; background:#ffe5fc;">
                    <img src="https://www.dupip.com/images/logo.png" alt="Dupip logo" width="140" height="42" style="display:block; width:140px; max-width:100%; height:auto;" />
                  </td>
                </tr>
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
                    <div>This is an automated message from Dupip. For privacy, message contents are not included in this email.</div>
                    <div style="margin-top:12px;">
                      ${footerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
                    </div>
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
    select: { chatMessageId: true, createdAt: true, sentAt: true },
  })

  const pendingMessages = filterUnreadChatMessagesForRenotification(
    candidates,
    existingNotifications,
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

async function reserveNotificationScope({
  recipientUserId,
  scopeKey,
  type,
  payload,
  chatMessageId,
}: {
  recipientUserId: string
  scopeKey: string
  type: string
  payload?: Record<string, unknown>
  chatMessageId?: string
}) {
  try {
    await prisma.emailNotification.create({
      data: {
        type,
        scopeKey,
        recipientUserId,
        chatMessageId,
        payload,
      },
    })

    return true
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error
    }
  }

  const reclaimedNotification = await prisma.emailNotification.updateMany({
    where: {
      recipientUserId,
      scopeKey,
      OR: [
        { sentAt: { lte: new Date(Date.now() - UNREAD_CHAT_RENOTIFY_AFTER_MS) } },
        {
          sentAt: null,
          createdAt: { lte: new Date(Date.now() - STALE_PENDING_NOTIFICATION_MS) },
        },
      ],
    },
    data: {
      type,
      chatMessageId,
      payload,
      sentAt: null,
    },
  })

  return reclaimedNotification.count > 0
}

async function reserveUnreadChatBatch(recipient: ChatEmailRecipient, messages: UnreadChatEmailMessage[]) {
  if (messages.length === 0) {
    return null
  }

  const batchKey = createUnreadChatBatchKey(messages.map((message) => message.id))
  const batchScopeKey = createNotificationScopeKey(UNREAD_CHAT_BATCH_NOTIFICATION, batchKey)

  const reservedBatch = await reserveNotificationScope({
    recipientUserId: recipient.id,
    scopeKey: batchScopeKey,
    type: UNREAD_CHAT_BATCH_NOTIFICATION,
    payload: {
      messageIds: messages.map((message) => message.id),
    },
  })

  if (!reservedBatch) {
    return null
  }

  const reservedMessageScopeKeys: string[] = []

  try {
    for (const message of messages) {
      const scopeKey = createNotificationScopeKey(UNREAD_CHAT_MESSAGE_NOTIFICATION, message.id)

      const reservedMessage = await reserveNotificationScope({
        recipientUserId: recipient.id,
        scopeKey,
        type: UNREAD_CHAT_MESSAGE_NOTIFICATION,
        chatMessageId: message.id,
        payload: {
          batchKey,
          roomLabel: message.roomLabel,
        },
      })

      if (!reservedMessage) {
        throw new Error(
          `Unread chat message notification is already reserved or not yet eligible for resend: ${message.id}`,
        )
      }

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

    if (
      error instanceof Error &&
      error.message.startsWith('Unread chat message notification is already reserved or not yet eligible for resend:')
    ) {
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

  const users = await prisma.user.findMany({
    where: { id: { in: candidateUserIds } },
    select: { id: true, email: true, userId: true },
  })

  const withEmail = users.filter((user) => !!user.email) as Array<{ id: string; email: string; userId: string | null }>
  const withoutEmail = users.filter((user) => !user.email && user.userId)

  let clerkEmails = new Map<string, string>()

  if (withoutEmail.length > 0) {
    try {
      const clerk = await clerkClient()
      const clerkUserIds = withoutEmail.map((user) => user.userId as string)
      const clerkUsers = await clerk.users.getUserList({ userId: clerkUserIds, limit: clerkUserIds.length })
      for (const clerkUser of clerkUsers.data) {
        const primaryEmail = clerkUser.emailAddresses.find(
          (addr) => addr.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress
        if (primaryEmail) {
          clerkEmails.set(clerkUser.id, primaryEmail)
        }
      }
    } catch (error) {
      console.error('Failed to fetch emails from Clerk:', error)
    }
  }

  const recipients: ChatEmailRecipient[] = []

  for (const user of withEmail) {
    recipients.push({ id: user.id, email: user.email })
  }

  for (const user of withoutEmail) {
    const email = clerkEmails.get(user.userId as string)
    if (email) {
      recipients.push({ id: user.id, email })
    }
  }

  return recipients
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

/* ---------------------------------------------------------------------------
 * Voicemail digest (phase 12) — unread voicemails fan out through the same
 * cron, deduped via EmailNotification rows (scopeKey "VOICEMAIL_EMAIL:{id}",
 * unique per recipient+scopeKey). A voicemail that stays unread is not
 * re-notified yet — same follow-up as chat messages is a later policy call.
 * ------------------------------------------------------------------------- */

const VOICEMAIL_EMAIL_NOTIFICATION = 'VOICEMAIL_EMAIL'

export type UnreadVoicemailEmailItem = {
  id: string
  callerLabel: string
  summary: string | null
  createdAt: Date
}

export function buildUnreadVoicemailEmailSubject(count: number) {
  return count === 1 ? 'You have 1 new Dupip voicemail' : `You have ${count} new Dupip voicemails`
}

export function buildUnreadVoicemailEmailText(items: UnreadVoicemailEmailItem[], voicemailUrl: string) {
  const lines = items.map((item) => {
    const when = item.createdAt.toLocaleString()
    return `- ${item.callerLabel} (${when}): ${item.summary ?? 'Listen to the full message in chat.'}`
  })
  return [
    `You have ${items.length} new voicemail${items.length === 1 ? '' : 's'} on Dupip:`,
    '',
    ...lines,
    '',
    `Open your voicemail inbox: ${voicemailUrl}`
  ].join('\n')
}

export function buildUnreadVoicemailEmailHtml(items: UnreadVoicemailEmailItem[], voicemailUrl: string) {
  const rows = items
    .map((item) => {
      const when = escapeHtml(item.createdAt.toLocaleString())
      const caller = escapeHtml(item.callerLabel)
      const summary = item.summary ? escapeHtml(item.summary) : 'Listen to the full message in chat.'
      return `<li><strong>${caller}</strong> <small>(${when})</small><br/>${summary}</li>`
    })
    .join('')
  return [
    `<p>You have ${items.length} new voicemail${items.length === 1 ? '' : 's'} on Dupip:</p>`,
    `<ul>${rows}</ul>`,
    `<p><a href="${escapeHtml(voicemailUrl)}">Open your voicemail inbox</a></p>`
  ].join('')
}

function callerLabelForVoicemail(voicemail: { callerName: string | null; callerPhone: string | null }) {
  return voicemail.callerName || voicemail.callerPhone || 'Unknown caller'
}

export async function processUnreadVoicemailEmailNotifications() {
  const unread = await prisma.voicemail.findMany({
    where: { readAt: null },
    orderBy: { createdAt: 'asc' }
  })
  if (unread.length === 0) {
    return { processedRecipients: 0, sentEmails: 0, reservedVoicemails: 0 }
  }

  // Recipient emails: internal User.email first, Clerk primary email fallback
  const targetUserIds = [...new Set(unread.map((voicemail) => voicemail.targetUserId))]
  const users = await prisma.user.findMany({
    where: { id: { in: targetUserIds } },
    select: { id: true, email: true, userId: true }
  })
  const emailById = new Map<string, string>()
  const withoutEmail = users.filter((user) => !user.email && user.userId)
  for (const user of users) {
    if (user.email) emailById.set(user.id, user.email)
  }
  if (withoutEmail.length > 0) {
    try {
      const clerk = await clerkClient()
      const clerkUsers = await clerk.users.getUserList({
        userId: withoutEmail.map((user) => user.userId as string),
        limit: withoutEmail.length
      })
      for (const clerkUser of clerkUsers.data) {
        const internal = withoutEmail.find((user) => user.userId === clerkUser.id)
        const email =
          clerkUser.primaryEmailAddress?.emailAddress ??
          clerkUser.emailAddresses?.[0]?.emailAddress
        if (internal && email) emailById.set(internal.id, email)
      }
    } catch {
      // no Clerk email channel for these recipients — skip them
    }
  }

  const transport = createMailTransport()
  const from = getFromAddress()
  const voicemailUrl = `${getChatUrl()}/voicemails`

  // Group unsent voicemails per recipient, skipping anything already
  // reserved/sent (scopeKey dedupe — idempotent across cron runs/retries).
  const byRecipient = new Map<
    string,
    Array<{ voicemail: (typeof unread)[number]; item: UnreadVoicemailEmailItem }>
  >()
  for (const voicemail of unread) {
    if (!emailById.has(voicemail.targetUserId)) continue
    const scopeKey = createNotificationScopeKey(VOICEMAIL_EMAIL_NOTIFICATION, voicemail.id)
    const existing = await prisma.emailNotification.findUnique({
      where: { recipientUserId_scopeKey: { recipientUserId: voicemail.targetUserId, scopeKey } }
    })
    if (existing) continue

    const entry = {
      voicemail,
      item: {
        id: voicemail.id,
        callerLabel: callerLabelForVoicemail(voicemail),
        summary: voicemail.summary,
        createdAt: voicemail.createdAt
      }
    }
    const list = byRecipient.get(voicemail.targetUserId) ?? []
    list.push(entry)
    byRecipient.set(voicemail.targetUserId, list)
  }

  if (byRecipient.size === 0) {
    return { processedRecipients: 0, sentEmails: 0, reservedVoicemails: 0 }
  }

  let sentEmails = 0
  let reservedVoicemails = 0
  for (const [targetUserId, entries] of byRecipient) {
    const email = emailById.get(targetUserId)
    if (!email) continue

    const scopeKeys = entries.map((entry) =>
      createNotificationScopeKey(VOICEMAIL_EMAIL_NOTIFICATION, entry.voicemail.id)
    )

    // Reserve first (unique recipientUserId+scopeKey prevents double-sends)
    try {
      await prisma.emailNotification.createMany({
        data: entries.map((entry) => ({
          type: VOICEMAIL_EMAIL_NOTIFICATION,
          scopeKey: createNotificationScopeKey(VOICEMAIL_EMAIL_NOTIFICATION, entry.voicemail.id),
          recipientUserId: targetUserId
        }))
      })
    } catch {
      // Concurrent run already reserved these — skip this recipient
      continue
    }

    const items = entries.map((entry) => entry.item)
    try {
      await transport.sendMail({
        from,
        to: email,
        subject: buildUnreadVoicemailEmailSubject(items.length),
        text: buildUnreadVoicemailEmailText(items, voicemailUrl),
        html: buildUnreadVoicemailEmailHtml(items, voicemailUrl)
      })

      await prisma.emailNotification.updateMany({
        where: { recipientUserId: targetUserId, scopeKey: { in: scopeKeys } },
        data: { sentAt: new Date() }
      })
      sentEmails += 1
      reservedVoicemails += items.length
    } catch (error) {
      console.error('Failed to send voicemail digest email:', { targetUserId, error })
      await prisma.emailNotification.deleteMany({
        where: { recipientUserId: targetUserId, scopeKey: { in: scopeKeys } }
      })
      throw error
    }
  }

  return { processedRecipients: byRecipient.size, sentEmails, reservedVoicemails }
}
