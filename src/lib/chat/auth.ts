import { auth, clerkClient } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import type { ClerkOrgSummary } from './types'
import type { ChatRoleValue } from './permissions'

export interface CurrentChatUser {
  id: string
  clerkUserId: string
  email: string | null
  friends: string[]
  closeFriends: string[]
}

export async function getOrCreateChatUser(clerkUserId: string): Promise<CurrentChatUser> {
  let user = await prisma.user.findUnique({
    where: { userId: clerkUserId },
    select: {
      id: true,
      userId: true,
      email: true,
      friends: true,
      closeFriends: true,
    },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        userId: clerkUserId,
        settings: { currency: null, speed: null },
      },
      select: {
        id: true,
        userId: true,
        email: true,
        friends: true,
        closeFriends: true,
      },
    })
  }

  return {
    id: user.id,
    clerkUserId: user.userId || clerkUserId,
    email: user.email ?? null,
    friends: (user.friends || []).map((value: unknown) => String(value)),
    closeFriends: (user.closeFriends || []).map((value: unknown) => String(value)),
  }
}

export async function getCurrentChatUser() {
  const { userId } = await auth()
  if (!userId) return null
  return getOrCreateChatUser(userId)
}

export async function requireCurrentChatUser() {
  const user = await getCurrentChatUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

export async function getUserChatRole(clerkOrgId: string, userId: string): Promise<ChatRoleValue | null> {
  const membership = await prisma.chatOrgMembership.findUnique({
    where: {
      clerkOrgId_userId: {
        clerkOrgId,
        userId,
      },
    },
    select: { role: true },
  })

  return membership?.role ?? null
}

export async function ensureOrgMembership(clerkOrgId: string, userId: string) {
  const membership = await prisma.chatOrgMembership.findUnique({
    where: {
      clerkOrgId_userId: {
        clerkOrgId,
        userId,
      },
    },
  })

  if (!membership) {
    throw new Error('Forbidden')
  }

  return membership
}

export async function ensureChannelAccess(channelId: string, userId: string) {
  const channel = await prisma.chatChannel.findUnique({ where: { id: channelId } })
  if (!channel || channel.archived) {
    throw new Error('Channel not found')
  }

  await ensureOrgMembership(channel.clerkOrgId, userId)
  return channel
}

export async function ensureDmParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.directMessageConversation.findUnique({ where: { id: conversationId } })
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  if (!conversation.participantUserIds.includes(userId)) {
    throw new Error('Forbidden')
  }

  return conversation
}

export async function canStartDirectMessage(currentUserId: string, participantUserId: string) {
  if (currentUserId === participantUserId) return false

  const [currentUser, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: currentUserId },
      select: { friends: true, closeFriends: true },
    }),
    prisma.user.findUnique({
      where: { id: participantUserId },
      select: { friends: true, closeFriends: true },
    }),
  ])

  const currentConnections = new Set([
    ...((currentUser?.friends || []).map((value: unknown) => String(value))),
    ...((currentUser?.closeFriends || []).map((value: unknown) => String(value))),
  ])
  const targetConnections = new Set([
    ...((targetUser?.friends || []).map((value: unknown) => String(value))),
    ...((targetUser?.closeFriends || []).map((value: unknown) => String(value))),
  ])

  return currentConnections.has(participantUserId) || targetConnections.has(currentUserId)
}

export async function getClerkOrganizations(orgIds: string[]): Promise<ClerkOrgSummary[]> {
  if (orgIds.length === 0) return []
  const client = await clerkClient()
  const response = await client.organizations.getOrganizationList({
    organizationId: orgIds,
    limit: orgIds.length,
  })
  return response.data
}

export function toClerkOrganizationRole(role: ChatRoleValue) {
  return role === 'ADMIN' || role === 'SUPERUSER' ? 'org:admin' : 'org:member'
}
