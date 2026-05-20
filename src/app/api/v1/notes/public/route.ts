import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import {
  buildVisibilityWhereClause,
  getCurrentUser,
  batchEnrichUserProfiles
} from '@/lib/services/visibility'
import { filterProfileFields } from '@/lib/utils/profileUtils'
import {
  calculateNoteRelevanceScore,
  normalizeNoteSortBy,
  sortNotes
} from '@/lib/utils/noteRelevance'

/**
 * Note select configuration for queries
 */
const noteSelect = {
  id: true,
  content: true,
  visibility: true,
  createdAt: true,
  date: true,
  userId: true,
  _count: {
    select: {
      comments: true,
      likes: true
    }
  },
  likes: {
    select: {
      userId: true
    }
  },
  comments: {
    include: {
      user: {
        select: {
          id: true,
          profiles: {
            select: {
              data: true
            }
          }
        }
      },
      _count: {
        select: {
          likes: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc' as const
    }
  }
}

/**
 * Sort comments by likes then by date and transform profiles
 */
function sortAndTransformComments(comments: any[]): any[] {
  if (!comments?.length) return []

  return [...comments]
    .sort((a, b) => {
      const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
      if (likeDiff !== 0) return likeDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .map((comment) => {
      const commentProfile = comment.user.profiles?.[0]
      const commentProfileData = commentProfile?.data || {}
      const profileForFiltering = {
        userName: commentProfileData.username?.value || null,
        firstName: commentProfileData.firstName?.value || null,
        lastName: commentProfileData.lastName?.value || null,
        bio: commentProfileData.bio?.value || null,
        profilePicture: commentProfileData.profilePicture?.value || null,
        firstNameVisibility: commentProfileData.firstName?.visibility ? 'PUBLIC' : 'PRIVATE',
        lastNameVisibility: commentProfileData.lastName?.visibility ? 'PUBLIC' : 'PRIVATE',
        userNameVisibility: commentProfileData.username?.visibility ? 'PUBLIC' : 'PRIVATE',
        bioVisibility: commentProfileData.bio?.visibility ? 'PUBLIC' : 'PRIVATE',
        profilePictureVisibility: commentProfileData.profilePicture?.visibility ? 'PUBLIC' : 'PRIVATE'
      }

      return {
        ...comment,
        user: {
          ...comment.user,
          profile: commentProfile
            ? filterProfileFields(profileForFiltering, {
                isOwner: false,
                isFriend: false,
                isCloseFriend: false
              })
            : null
        }
      }
    })
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const skip = (page - 1) * limit
    const filterNoteId = searchParams.get('noteId')
    const filterProfileId = searchParams.get('profileId')
    const sortBy = normalizeNoteSortBy(searchParams.get('sort'))

    const { userId } = await auth()

    // Build visibility-aware where clause using shared service
    const whereClause = await buildVisibilityWhereClause(userId || null, 'userId')

    // Fetch matching notes first if filter is provided
    let matchingNotes: any[] = []
    let matchingNoteIds: string[] = []

    if (filterNoteId || filterProfileId) {
      const matchingWhereClause: any = { ...whereClause }

      if (filterNoteId) {
        matchingWhereClause.id = filterNoteId
      }

      if (filterProfileId) {
        const profileUser = await prisma.user.findFirst({
          where: {
            OR: [{ id: filterProfileId }, { userId: filterProfileId }]
          },
          select: { id: true }
        })
        if (profileUser) {
          matchingWhereClause.userId = profileUser.id
        }
      }

      const matching = await prisma.note.findMany({
        where: matchingWhereClause,
        orderBy: { createdAt: 'desc' },
        select: noteSelect
      })

      matchingNotes = matching
      matchingNoteIds = matching.map(n => n.id.toString())
    }

    // Fetch regular notes, excluding matching ones
    const regularWhereClause = matchingNoteIds.length > 0
      ? { ...whereClause, id: { notIn: matchingNoteIds } }
      : whereClause

    const regularLimit = matchingNoteIds.length > 0
      ? limit - matchingNotes.length
      : limit

    const notes = await prisma.note.findMany({
      where: regularWhereClause,
      orderBy: { createdAt: 'desc' },
      take: Math.max(0, regularLimit),
      skip: Math.max(0, skip),
      select: noteSelect
    })

    // Combine matching notes first, then regular notes
    const allNotes = [...matchingNotes, ...notes]

    // Get current user for relationship checking
    const currentUser = await getCurrentUser(userId || null)

    // Sort comments and compute relevance
    const notesWithSortedComments = allNotes.map(note => ({
      ...note,
      comments: sortAndTransformComments(note.comments),
      relevanceScore: sortBy === 'most_relevant'
        ? calculateNoteRelevanceScore(note, {
            friendUserIds: currentUser?.friends || [],
            closeFriendUserIds: currentUser?.closeFriends || [],
            currentUserId: currentUser?.id ?? null
          })
        : undefined
    }))

    // Collect all user IDs for batch profile fetching (fixes N+1)
    const userIds = notesWithSortedComments
      .map(note => note.userId)
      .filter((id): id is string => !!id)

    // Batch fetch all user profiles
    const profilesMap = await batchEnrichUserProfiles(userIds, currentUser)

    // Enrich notes with user profiles
    const notesWithUsers = notesWithSortedComments
      .filter(note => note.userId) // Filter out notes without users
      .map(note => {
        const userProfile = profilesMap.get(note.userId)
        return {
          ...note,
          user: userProfile || { id: note.userId, profile: { userName: null } }
        }
      })

    const sortedNotesWithUsers = sortNotes(notesWithUsers, sortBy)

    // Get total count for pagination
    const totalCount = await prisma.note.count({
      where: whereClause
    })

    const hasMore = skip + sortedNotesWithUsers.length < totalCount

    return NextResponse.json({
      notes: sortedNotesWithUsers,
      hasMore,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit)
    })
  } catch (error) {
    console.error('Error fetching public notes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
