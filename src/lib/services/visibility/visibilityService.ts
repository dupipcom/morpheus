/**
 * Visibility Service
 * Centralized service for visibility-aware queries and profile enrichment
 * Eliminates N+1 queries and code duplication across public routes
 */

import prisma from '@/lib/prisma'
import { filterProfileFields } from '@/lib/utils/profileUtils'
import type {
  CurrentUser,
  RelationshipInfo,
  ProfileData,
  FilteredProfile,
  UserWithProfile,
  VisibilityWhereClause
} from './types'

/**
 * Get current user with friends/closeFriends lists
 * Returns null if not authenticated
 */
export async function getCurrentUser(clerkUserId: string | null): Promise<CurrentUser | null> {
  if (!clerkUserId) return null

  const user = await prisma.user.findUnique({
    where: { userId: clerkUserId },
    select: {
      id: true,
      userId: true,
      friends: true,
      closeFriends: true
    }
  })

  if (!user) return null

  return {
    id: user.id,
    clerkUserId: user.userId,
    friends: (user.friends || []).map((id: unknown) => String(id)),
    closeFriends: (user.closeFriends || []).map((id: unknown) => String(id))
  }
}

/**
 * Build visibility-aware where clause for public content queries
 * Handles PUBLIC, FRIENDS, and CLOSE_FRIENDS visibility levels
 */
export async function buildVisibilityWhereClause(
  clerkUserId: string | null,
  userIdField: string = 'userId'
): Promise<VisibilityWhereClause> {
  const whereClause: VisibilityWhereClause = { OR: [] }

  // Always include PUBLIC visibility
  whereClause.OR.push({ visibility: 'PUBLIC' })

  if (!clerkUserId) {
    return whereClause
  }

  const currentUser = await getCurrentUser(clerkUserId)
  if (!currentUser) {
    return whereClause
  }

  // Include user's own content with FRIENDS or CLOSE_FRIENDS visibility
  whereClause.OR.push({
    AND: [
      { [userIdField]: currentUser.id },
      { visibility: { in: ['FRIENDS', 'CLOSE_FRIENDS'] } }
    ]
  })

  // Find users who have current user in their friends list
  const usersWithCurrentUserAsFriend = await prisma.user.findMany({
    where: { friends: { has: currentUser.id } },
    select: { id: true }
  })
  const friendUserIds = usersWithCurrentUserAsFriend.map(u => u.id)

  // Find users who have current user in their closeFriends list
  const usersWithCurrentUserAsCloseFriend = await prisma.user.findMany({
    where: { closeFriends: { has: currentUser.id } },
    select: { id: true }
  })
  const closeFriendUserIds = usersWithCurrentUserAsCloseFriend.map(u => u.id)

  // Include FRIENDS visibility content from users who have current user as friend
  if (friendUserIds.length > 0) {
    whereClause.OR.push({
      AND: [
        { visibility: 'FRIENDS' },
        { [userIdField]: { in: friendUserIds } }
      ]
    })
  }

  // Include CLOSE_FRIENDS visibility content from users who have current user as close friend
  if (closeFriendUserIds.length > 0) {
    whereClause.OR.push({
      AND: [
        { visibility: 'CLOSE_FRIENDS' },
        { [userIdField]: { in: closeFriendUserIds } }
      ]
    })
  }

  return whereClause
}

/**
 * Build visibility where clause for entities with users array (like templates/lists)
 * These use { users: { some: { userId, role } } } pattern
 */
export async function buildVisibilityWhereClauseForUserArray(
  clerkUserId: string | null
): Promise<VisibilityWhereClause> {
  const whereClause: VisibilityWhereClause = { OR: [] }

  // Always include PUBLIC visibility
  whereClause.OR.push({ visibility: 'PUBLIC' })

  if (!clerkUserId) {
    return whereClause
  }

  const currentUser = await getCurrentUser(clerkUserId)
  if (!currentUser) {
    return whereClause
  }

  // Include user's own content with FRIENDS or CLOSE_FRIENDS visibility
  whereClause.OR.push({
    AND: [
      { users: { some: { userId: currentUser.id, role: 'OWNER' } } },
      { visibility: { in: ['FRIENDS', 'CLOSE_FRIENDS'] } }
    ]
  })

  // Find users who have current user in their friends list
  const usersWithCurrentUserAsFriend = await prisma.user.findMany({
    where: { friends: { has: currentUser.id } },
    select: { id: true }
  })
  const friendUserIds = usersWithCurrentUserAsFriend.map(u => u.id)

  // Find users who have current user in their closeFriends list
  const usersWithCurrentUserAsCloseFriend = await prisma.user.findMany({
    where: { closeFriends: { has: currentUser.id } },
    select: { id: true }
  })
  const closeFriendUserIds = usersWithCurrentUserAsCloseFriend.map(u => u.id)

  // Include FRIENDS visibility content
  if (friendUserIds.length > 0) {
    whereClause.OR.push({
      AND: [
        { visibility: 'FRIENDS' },
        { OR: friendUserIds.map(id => ({ users: { some: { userId: id, role: 'OWNER' } } })) }
      ]
    })
  }

  // Include CLOSE_FRIENDS visibility content
  if (closeFriendUserIds.length > 0) {
    whereClause.OR.push({
      AND: [
        { visibility: 'CLOSE_FRIENDS' },
        { OR: closeFriendUserIds.map(id => ({ users: { some: { userId: id, role: 'OWNER' } } })) }
      ]
    })
  }

  return whereClause
}

/**
 * Determine relationship between current user and target user
 */
export function getRelationship(
  currentUser: CurrentUser | null,
  targetUserId: string,
  targetUserFriends: string[],
  targetUserCloseFriends: string[]
): RelationshipInfo {
  if (!currentUser) {
    return { isOwner: false, isFriend: false, isCloseFriend: false }
  }

  const currentUserIdStr = currentUser.id
  const targetUserIdStr = targetUserId

  const isOwner = currentUserIdStr === targetUserIdStr

  // Bidirectional close friend check
  const isCloseFriend = !isOwner &&
    targetUserCloseFriends.includes(currentUserIdStr) &&
    currentUser.closeFriends.includes(targetUserIdStr)

  // Bidirectional friend check (but not if already close friend)
  const isFriend = !isOwner && !isCloseFriend &&
    targetUserFriends.includes(currentUserIdStr) &&
    currentUser.friends.includes(targetUserIdStr)

  return { isOwner, isFriend, isCloseFriend }
}

/**
 * Extract profile data from database profile structure
 */
export function extractProfileData(profileData: Record<string, unknown> | null): ProfileData {
  if (!profileData) {
    return {
      userName: null,
      firstName: null,
      lastName: null,
      bio: null,
      profilePicture: null,
      firstNameVisibility: 'PRIVATE',
      lastNameVisibility: 'PRIVATE',
      userNameVisibility: 'PRIVATE',
      bioVisibility: 'PRIVATE',
      profilePictureVisibility: 'PRIVATE'
    }
  }

  const data = profileData as Record<string, { value?: unknown; visibility?: boolean }>

  return {
    userName: (data.username?.value as string) || null,
    firstName: (data.firstName?.value as string) || null,
    lastName: (data.lastName?.value as string) || null,
    bio: (data.bio?.value as string) || null,
    profilePicture: (data.profilePicture?.value as string) || null,
    firstNameVisibility: data.firstName?.visibility ? 'PUBLIC' : 'PRIVATE',
    lastNameVisibility: data.lastName?.visibility ? 'PUBLIC' : 'PRIVATE',
    userNameVisibility: data.username?.visibility ? 'PUBLIC' : 'PRIVATE',
    bioVisibility: data.bio?.visibility ? 'PUBLIC' : 'PRIVATE',
    profilePictureVisibility: data.profilePicture?.visibility ? 'PUBLIC' : 'PRIVATE'
  }
}

/**
 * Batch fetch and enrich user profiles for a list of user IDs
 * Eliminates N+1 queries by fetching all users in a single query
 */
export async function batchEnrichUserProfiles(
  userIds: string[],
  currentUser: CurrentUser | null
): Promise<Map<string, UserWithProfile>> {
  const result = new Map<string, UserWithProfile>()

  if (userIds.length === 0) {
    return result
  }

  // Deduplicate user IDs
  const uniqueUserIds = [...new Set(userIds)]

  // Batch fetch all users with their profiles and friend lists
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: {
      id: true,
      friends: true,
      closeFriends: true,
      profiles: {
        select: { data: true }
      }
    }
  })

  // Process each user
  for (const user of users) {
    const profile = user.profiles?.[0]
    const userFriends = (user.friends || []).map((id: unknown) => String(id))
    const userCloseFriends = (user.closeFriends || []).map((id: unknown) => String(id))

    if (!profile) {
      result.set(user.id, {
        id: user.id,
        profile: { userName: null }
      })
      continue
    }

    const profileData = extractProfileData(profile.data as Record<string, unknown>)
    const relationship = getRelationship(currentUser, user.id, userFriends, userCloseFriends)
    const filteredProfile = filterProfileFields(profileData, relationship)

    result.set(user.id, {
      id: user.id,
      profile: filteredProfile
    })
  }

  return result
}

/**
 * Get owner ID from entity (supports both userId field and users array)
 */
export function getOwnerId(entity: { userId?: string; users?: Array<{ userId: string; role: string }> }): string | null {
  if (entity.userId) {
    return entity.userId
  }

  if (entity.users && Array.isArray(entity.users)) {
    const owner = entity.users.find(u => u.role === 'OWNER')
    return owner?.userId || null
  }

  return null
}

/**
 * Enrich entities with filtered user profiles
 * Generic function that works with notes, templates, comments, etc.
 */
export async function enrichEntitiesWithProfiles<T extends { userId?: string; users?: Array<{ userId: string; role: string }> }>(
  entities: T[],
  currentUser: CurrentUser | null
): Promise<Array<T & { user: UserWithProfile | null }>> {
  // Collect all owner IDs
  const ownerIds = entities
    .map(entity => getOwnerId(entity))
    .filter((id): id is string => id !== null)

  // Batch fetch profiles
  const profilesMap = await batchEnrichUserProfiles(ownerIds, currentUser)

  // Enrich entities
  return entities.map(entity => {
    const ownerId = getOwnerId(entity)
    const userProfile = ownerId ? profilesMap.get(ownerId) || null : null

    return {
      ...entity,
      user: userProfile
    }
  })
}
