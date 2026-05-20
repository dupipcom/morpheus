import prisma from '@/lib/prisma'
import { extractUrls } from '@/lib/utils/linkPreview'
import { getRoomKey } from './unread'
import { CHAT_ANONYMOUS_MARKER, CHAT_DELETED_MESSAGE_MARKER } from './constants'
import { getClerkOrganizations } from './auth'
import { isChatInviteActive } from './invites'
import type {
  ChatMessageSummary,
  ChatPendingInviteSummary,
  ChatUserProfile,
  ClerkOrgSummary,
  StoredProfileData,
} from './types'

type MinimalChatMessage = {
  id: string
  roomType: 'ORG_CHANNEL' | 'DIRECT_MESSAGE'
  channelId: string | null
  dmConversationId: string | null
  authorUserId: string
  content: string
  replyToMessageId: string | null
  threadRootMessageId: string | null
  deletedAt: Date | null
  metadata: unknown
  createdAt: Date
  updatedAt: Date
  editedAt: Date | null
}

const NOT_DELETED_FILTER = {
  OR: [
    { deletedAt: null as Date | null },
    { deletedAt: { isSet: false } },
  ],
}

async function getProfilesForUserIds(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds)]
  if (uniqueUserIds.length === 0) return new Map<string, ChatUserProfile>()

  const [users, profiles] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, userId: true },
    }),
    prisma.profile.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { userId: true, data: true },
    }),
  ])

  const profileByUserId = new Map<string, StoredProfileData | null>()
  for (const profile of profiles) {
    profileByUserId.set(profile.userId, (profile.data as StoredProfileData | null) ?? null)
  }

  return new Map(
    users.map((user) => {
      const profile = profileByUserId.get(user.id)
      const username = profile?.username?.value ?? null
      const firstName = profile?.firstName?.value ?? null
      const lastName = profile?.lastName?.value ?? null
      const displayName = [firstName, lastName].filter(Boolean).join(' ') || (username ? `@${username}` : CHAT_ANONYMOUS_MARKER)

      return [
        user.id,
        {
          id: user.id,
          userId: user.userId ?? null,
          username,
          displayName,
          imageUrl: profile?.profilePicture?.value ?? null,
        } satisfies ChatUserProfile,
      ]
    }),
  )
}

function serializeMessage(
  message: MinimalChatMessage,
  author: ChatUserProfile | null,
  extras: { replyCount?: number; latestReplyAt?: Date | null } = {},
): ChatMessageSummary {
  return {
    id: message.id,
    roomType: message.roomType,
    channelId: message.channelId ?? null,
    dmConversationId: message.dmConversationId ?? null,
    authorUserId: message.authorUserId,
    content: message.content,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    replyToMessageId: message.replyToMessageId ?? null,
    threadRootMessageId: message.threadRootMessageId ?? null,
    metadata: (message.metadata as Record<string, unknown> | null) ?? null,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    author,
    replyCount: extras.replyCount,
    latestReplyAt: extras.latestReplyAt?.toISOString() ?? null,
  }
}

async function getReplyStats(rootIds: string[]) {
  const stats = new Map<string, { replyCount: number; latestReplyAt: Date | null }>()

  await Promise.all(rootIds.map(async (rootId) => {
    const [replyCount, latestReply] = await Promise.all([
      prisma.chatMessage.count({ where: { threadRootMessageId: rootId, ...NOT_DELETED_FILTER } }),
      prisma.chatMessage.findFirst({
        where: { threadRootMessageId: rootId, ...NOT_DELETED_FILTER },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])

    stats.set(rootId, { replyCount, latestReplyAt: latestReply?.createdAt ?? null })
  }))

  return stats
}

async function getUnreadCountForRoom(
  userId: string,
  room: { channelId?: string; dmConversationId?: string },
) {
  const roomKey = getRoomKey(room)
  const readState = await prisma.chatReadState.findUnique({
    where: {
      userId_roomKey: {
        userId,
        roomKey,
      },
    },
  })

  const where = room.channelId
    ? { channelId: room.channelId, authorUserId: { not: userId }, ...NOT_DELETED_FILTER }
    : { dmConversationId: room.dmConversationId, authorUserId: { not: userId }, ...NOT_DELETED_FILTER }

  if (!readState?.lastReadAt) {
    return prisma.chatMessage.count({ where })
  }

  return prisma.chatMessage.count({
    where: {
      ...where,
      createdAt: { gt: readState.lastReadAt },
    },
  })
}

export async function listChannelMessages(channelId: string, limit = 50) {
  const messages = await prisma.chatMessage.findMany({
    where: { channelId, threadRootMessageId: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const ordered = [...messages].reverse()
  const profiles = await getProfilesForUserIds(ordered.map((message) => message.authorUserId))
  const replyStats = await getReplyStats(ordered.map((message) => message.id))

  return ordered.map((message) => {
    const stats = replyStats.get(message.id)
    return serializeMessage(message, profiles.get(message.authorUserId) ?? null, stats)
  })
}

export async function listDmMessages(conversationId: string, limit = 50) {
  const messages = await prisma.chatMessage.findMany({
    where: { dmConversationId: conversationId, threadRootMessageId: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const ordered = [...messages].reverse()
  const profiles = await getProfilesForUserIds(ordered.map((message) => message.authorUserId))
  const replyStats = await getReplyStats(ordered.map((message) => message.id))

  return ordered.map((message) => {
    const stats = replyStats.get(message.id)
    return serializeMessage(message, profiles.get(message.authorUserId) ?? null, stats)
  })
}

export async function getThread(messageId: string) {
  const rootMessage = await prisma.chatMessage.findUnique({ where: { id: messageId } })
  if (!rootMessage) {
    throw new Error('Message not found')
  }

  const replies = await prisma.chatMessage.findMany({
    where: { threadRootMessageId: messageId },
    orderBy: { createdAt: 'asc' },
  })

  const profiles = await getProfilesForUserIds([rootMessage.authorUserId, ...replies.map((reply) => reply.authorUserId)])

  return {
    root: serializeMessage(rootMessage, profiles.get(rootMessage.authorUserId) ?? null),
    replies: replies.map((reply) => serializeMessage(reply, profiles.get(reply.authorUserId) ?? null)),
  }
}

export async function buildMessageMetadata(content: string) {
  const urls = extractUrls(content)
  return urls.length > 0 ? { urls } : null
}

/**
 * Load pending targeted org invites for a user, filter out expired/exhausted links,
 * and enrich each invite with organization metadata for the chat sidebar.
 */
export async function getPendingChatInvites(userId: string) {
  const invites = await prisma.chatInviteLink.findMany({
    where: {
      inviteeUserId: userId,
      status: 'ACTIVE',
    },
    orderBy: { createdAt: 'desc' },
  })

  const activeInvites = invites.filter((invite) => isChatInviteActive(invite))
  if (activeInvites.length === 0) return []

  const orgIds = [...new Set(activeInvites.map((invite) => invite.clerkOrgId))]
  const orgs = await getClerkOrganizations(orgIds).catch(() => [])
  const orgMap = new Map(orgs.map((org) => [org.id, org]))

  return activeInvites.map((invite) => ({
    id: invite.id,
    token: invite.token,
    clerkOrgId: invite.clerkOrgId,
    orgName: orgMap.get(invite.clerkOrgId)?.name ?? invite.clerkOrgId,
    orgSlug: orgMap.get(invite.clerkOrgId)?.slug ?? invite.clerkOrgId,
    createdAt: invite.createdAt.toISOString(),
    createdByUserId: invite.createdByUserId,
  } satisfies ChatPendingInviteSummary))
}

export async function getUnreadCount(userId: string) {
  const [channels, dms, pendingInvites] = await Promise.all([
    prisma.chatChannel.findMany({
      where: {
        archived: false,
        clerkOrgId: {
          in: (
            await prisma.chatOrgMembership.findMany({ where: { userId }, select: { clerkOrgId: true } })
          ).map((membership) => membership.clerkOrgId),
        },
      },
      select: { id: true },
    }),
    prisma.directMessageConversation.findMany({
      where: { participantUserIds: { has: userId } },
      select: { id: true },
    }),
    getPendingChatInvites(userId),
  ])

  const roomCounts = await Promise.all([
    ...channels.map((channel) => getUnreadCountForRoom(userId, { channelId: channel.id })),
    ...dms.map((conversation) => getUnreadCountForRoom(userId, { dmConversationId: conversation.id })),
  ])

  return roomCounts.reduce((total, count) => total + count, 0) + pendingInvites.length
}

export async function getChatSidebar(userId: string) {
  const memberships = await prisma.chatOrgMembership.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  const orgIds = memberships.map((membership) => membership.clerkOrgId)
  const [orgs, channels, dms, pendingInvites] = await Promise.all([
    getClerkOrganizations(orgIds).catch(() => []),
    prisma.chatChannel.findMany({
      where: { clerkOrgId: { in: orgIds }, archived: false },
      orderBy: [{ clerkOrgId: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    }),
    prisma.directMessageConversation.findMany({
      where: { participantUserIds: { has: userId } },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    }),
    getPendingChatInvites(userId),
  ])

  const orgMeta = new Map((orgs as ClerkOrgSummary[]).map((org) => [org.id, org]))
  const dmUserIds = dms.flatMap((conversation) => conversation.participantUserIds.filter((participantId) => participantId !== userId))
  const profiles = await getProfilesForUserIds(dmUserIds)

  const channelRoomData = await Promise.all(channels.map(async (channel) => {
    const [lastMessage, unreadCount] = await Promise.all([
      prisma.chatMessage.findFirst({ where: { channelId: channel.id }, orderBy: { createdAt: 'desc' } }),
      getUnreadCountForRoom(userId, { channelId: channel.id }),
    ])

    return {
      id: channel.id,
      clerkOrgId: channel.clerkOrgId,
      name: channel.name,
      slug: channel.slug,
      description: channel.description,
      type: channel.type,
      unreadCount,
      lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
      lastMessagePreview: lastMessage?.deletedAt ? CHAT_DELETED_MESSAGE_MARKER : lastMessage?.content ?? null,
    }
  }))

  const dmRoomData = await Promise.all(dms.map(async (conversation) => {
    const otherParticipantId = conversation.participantUserIds.find((participantId) => participantId !== userId) || userId
    const profile = profiles.get(otherParticipantId) ?? null
    const [lastMessage, unreadCount] = await Promise.all([
      prisma.chatMessage.findFirst({ where: { dmConversationId: conversation.id }, orderBy: { createdAt: 'desc' } }),
      getUnreadCountForRoom(userId, { dmConversationId: conversation.id }),
    ])

    return {
      id: conversation.id,
      participantUserIds: conversation.participantUserIds,
      participant: profile,
      unreadCount,
      lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
      lastMessagePreview: lastMessage?.deletedAt ? CHAT_DELETED_MESSAGE_MARKER : lastMessage?.content ?? null,
    }
  }))

  const totalUnreadCount = [...channelRoomData, ...dmRoomData].reduce((total, room) => total + room.unreadCount, 0)

  return {
    currentUserId: userId,
    totalUnreadCount: totalUnreadCount + pendingInvites.length,
    messageUnreadCount: totalUnreadCount,
    pendingInvitesCount: pendingInvites.length,
    pendingInvites,
    orgs: memberships.map((membership) => ({
      id: membership.clerkOrgId,
      role: membership.role,
      name: orgMeta.get(membership.clerkOrgId)?.name ?? membership.clerkOrgId,
      slug: orgMeta.get(membership.clerkOrgId)?.slug ?? membership.clerkOrgId,
      imageUrl: orgMeta.get(membership.clerkOrgId)?.imageUrl ?? null,
      channels: channelRoomData.filter((channel) => channel.clerkOrgId === membership.clerkOrgId),
    })),
    dms: dmRoomData,
  }
}
