import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import {
  getCurrentUser,
  extractProfileData,
  getRelationship
} from '@/lib/services/visibility'
import { filterProfileFields } from '@/lib/utils/profileUtils'

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') || '').trim()

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] })
    }

    // Get current user with visibility service
    const currentUser = await getCurrentUser(clerkUserId)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get users who have current user as friend (bidirectional check)
    const usersWithCurrentUserAsFriend = await prisma.user.findMany({
      where: { friends: { has: currentUser.id } },
      select: { id: true }
    })
    const friendUserIds = usersWithCurrentUserAsFriend.map(u => u.id)

    // Get users who have current user as close friend (bidirectional check)
    const usersWithCurrentUserAsCloseFriend = await prisma.user.findMany({
      where: { closeFriends: { has: currentUser.id } },
      select: { id: true }
    })
    const closeFriendUserIds = usersWithCurrentUserAsCloseFriend.map(u => u.id)

    const results: any[] = []

    // Search Lists with proper visibility (use Prisma for security)
    const lists = await searchLists(query, currentUser.id, friendUserIds, closeFriendUserIds)
    results.push(...lists)

    // Search Profiles with proper visibility filtering
    const profiles = await searchProfiles(query, currentUser, friendUserIds, closeFriendUserIds)
    results.push(...profiles)

    // Search Notes with proper visibility
    const notes = await searchNotes(query, currentUser.id, friendUserIds, closeFriendUserIds)
    results.push(...notes)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error in search:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Search Lists with proper bidirectional visibility checks
 */
async function searchLists(
  query: string,
  userId: string,
  friendUserIds: string[],
  closeFriendUserIds: string[]
) {
  const visibilityConditions: any[] = [
    // User's own lists
    { users: { some: { userId } } },
    // Public lists
    { visibility: 'PUBLIC' }
  ]

  // FRIENDS visibility: only if owner has current user as friend
  if (friendUserIds.length > 0) {
    visibilityConditions.push({
      AND: [
        { visibility: 'FRIENDS' },
        { users: { some: { userId: { in: friendUserIds }, role: 'OWNER' } } }
      ]
    })
  }

  // CLOSE_FRIENDS visibility: only if owner has current user as close friend
  if (closeFriendUserIds.length > 0) {
    visibilityConditions.push({
      AND: [
        { visibility: 'CLOSE_FRIENDS' },
        { users: { some: { userId: { in: closeFriendUserIds }, role: 'OWNER' } } }
      ]
    })
  }

  const lists = await prisma.list.findMany({
    where: {
      AND: [
        {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { role: { contains: query, mode: 'insensitive' } }
          ]
        },
        { OR: visibilityConditions }
      ]
    },
    take: 5,
    select: {
      id: true,
      name: true,
      role: true
    }
  })

  return lists.map(list => ({
    id: list.id,
    name: list.name || list.role || 'Untitled List',
    type: 'list',
    role: list.role
  }))
}

/**
 * Search Profiles with proper visibility filtering for returned fields
 */
async function searchProfiles(
  query: string,
  currentUser: { id: string; friends: string[]; closeFriends: string[] },
  friendUserIds: string[],
  closeFriendUserIds: string[]
) {
  // Fetch profiles that might match
  const profiles = await prisma.profile.findMany({
    where: {
      userId: { not: currentUser.id }
    },
    take: 20,
    select: {
      userId: true,
      username: true,
      data: true,
      user: {
        select: {
          id: true,
          friends: true,
          closeFriends: true
        }
      }
    }
  })

  const results: any[] = []

  for (const profile of profiles) {
    const profileData = extractProfileData(profile.data as Record<string, unknown>)
    const userName = profileData.userName || profile.username || ''
    const firstName = profileData.firstName || ''
    const lastName = profileData.lastName || ''

    // Check if query matches any searchable field
    const matchesQuery =
      userName.toLowerCase().includes(query.toLowerCase()) ||
      firstName.toLowerCase().includes(query.toLowerCase()) ||
      lastName.toLowerCase().includes(query.toLowerCase())

    if (!matchesQuery) continue

    // Determine relationship for proper field filtering
    const userFriends = (profile.user?.friends || []).map((id: unknown) => String(id))
    const userCloseFriends = (profile.user?.closeFriends || []).map((id: unknown) => String(id))
    const relationship = getRelationship(
      { id: currentUser.id, clerkUserId: '', friends: currentUser.friends, closeFriends: currentUser.closeFriends },
      profile.userId,
      userFriends,
      userCloseFriends
    )

    // For non-friends, only show if matching field is publicly visible
    if (!relationship.isFriend && !relationship.isCloseFriend) {
      const userNameVisible = profileData.userNameVisibility === 'PUBLIC'
      const firstNameVisible = profileData.firstNameVisibility === 'PUBLIC'
      const lastNameVisible = profileData.lastNameVisibility === 'PUBLIC'

      const hasVisibleMatch =
        (userNameVisible && userName.toLowerCase().includes(query.toLowerCase())) ||
        (firstNameVisible && firstName.toLowerCase().includes(query.toLowerCase())) ||
        (lastNameVisible && lastName.toLowerCase().includes(query.toLowerCase()))

      if (!hasVisibleMatch) continue
    }

    // Filter profile fields based on relationship
    const filteredProfile = filterProfileFields(profileData, relationship)

    results.push({
      id: profile.userId,
      name: filteredProfile.userName || filteredProfile.firstName || filteredProfile.lastName || 'Anonymous',
      type: 'profile',
      username: filteredProfile.userName,
      firstName: filteredProfile.firstName,
      lastName: filteredProfile.lastName,
      profilePicture: filteredProfile.profilePicture
    })

    if (results.length >= 5) break
  }

  return results
}

/**
 * Search Notes with proper bidirectional visibility checks
 */
async function searchNotes(
  query: string,
  userId: string,
  friendUserIds: string[],
  closeFriendUserIds: string[]
) {
  const visibilityConditions: any[] = [
    // User's own notes
    { userId },
    // Public notes
    { visibility: 'PUBLIC' }
  ]

  // FRIENDS visibility: only if owner has current user as friend
  if (friendUserIds.length > 0) {
    visibilityConditions.push({
      AND: [
        { visibility: 'FRIENDS' },
        { userId: { in: friendUserIds } }
      ]
    })
  }

  // CLOSE_FRIENDS visibility: only if owner has current user as close friend
  if (closeFriendUserIds.length > 0) {
    visibilityConditions.push({
      AND: [
        { visibility: 'CLOSE_FRIENDS' },
        { userId: { in: closeFriendUserIds } }
      ]
    })
  }

  const notes = await prisma.note.findMany({
    where: {
      content: { contains: query, mode: 'insensitive' },
      OR: visibilityConditions
    },
    take: 5,
    select: {
      id: true,
      content: true,
      date: true,
      visibility: true
    }
  })

  return notes.map(note => ({
    id: note.id,
    name: note.content?.substring(0, 100) || 'Untitled Note',
    type: 'note',
    content: note.content,
    date: note.date,
    visibility: note.visibility
  }))
}


