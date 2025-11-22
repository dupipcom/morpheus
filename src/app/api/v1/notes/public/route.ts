import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { filterProfileFields } from '@/lib/profileUtils'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const skip = (page - 1) * limit
    const filterNoteId = searchParams.get('noteId')
    const filterProfileId = searchParams.get('profileId')

    const { userId } = await auth()
    
    // Build where clause based on authentication and friendship status
    let whereClause: any = {
      OR: []
    }

    // Always include PUBLIC notes (from all users, including the authenticated user's own public notes)
    whereClause.OR.push({
      visibility: 'PUBLIC'
    })

    // If user is authenticated, include notes from users who have the current user in their friends/closeFriends lists
    if (userId) {
      const currentUser = await prisma.user.findUnique({
        where: { userId },
        select: {
          id: true
        }
      })

      if (currentUser) {
        // Include current user's own notes with FRIENDS or CLOSE_FRIENDS visibility
        whereClause.OR.push({
          AND: [
            { userId: currentUser.id },
            { visibility: { in: ['FRIENDS', 'CLOSE_FRIENDS'] } }
          ]
        })

        // Find all users who have the current user in their friends list
        const usersWithCurrentUserAsFriend = await prisma.user.findMany({
          where: {
            friends: {
              has: currentUser.id
            }
          },
          select: {
            id: true
          }
        })
        const friendUserIds = usersWithCurrentUserAsFriend.map(u => u.id)

        // Find all users who have the current user in their closeFriends list
        const usersWithCurrentUserAsCloseFriend = await prisma.user.findMany({
          where: {
            closeFriends: {
              has: currentUser.id
            }
          },
          select: {
            id: true
          }
        })
        const closeFriendUserIds = usersWithCurrentUserAsCloseFriend.map(u => u.id)

        // Include notes from users who have current user in their friends list (FRIENDS visibility)
        if (friendUserIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'FRIENDS' },
              { userId: { in: friendUserIds } }
            ]
          })
        }

        // Include notes from users who have current user in their closeFriends list (CLOSE_FRIENDS visibility)
        if (closeFriendUserIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'CLOSE_FRIENDS' },
              { userId: { in: closeFriendUserIds } }
            ]
          })
        }
      }
    }

    // Build filter for matching items (noteId or profileId)
    let matchingNotes: any[] = []
    let matchingNoteIds: string[] = []
    
    if (filterNoteId || filterProfileId) {
      const matchingWhereClause: any = {
        ...whereClause
      }
      
      // Add specific filters
      if (filterNoteId) {
        matchingWhereClause.id = filterNoteId
      }
      if (filterProfileId) {
        // Convert profileId (userId) to user's internal ID if needed
        const profileUser = await prisma.user.findFirst({
          where: {
            OR: [
              { id: filterProfileId },
              { userId: filterProfileId }
            ]
          },
          select: { id: true }
        })
        if (profileUser) {
          matchingWhereClause.userId = profileUser.id
        }
      }
      
      // Fetch matching notes first (no pagination, get all matches)
      const matching = await prisma.note.findMany({
        where: matchingWhereClause,
        orderBy: {
          createdAt: 'desc'
        },
        select: {
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
          comments: {
            include: {
              user: {
                include: {
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
              createdAt: 'desc'
            }
          },
          user: {
            select: {
              id: true,
              friends: true,
              closeFriends: true,
              profiles: {
                select: {
                  data: true
                }
              }
            }
          }
        }
      })
      
      matchingNotes = matching
      matchingNoteIds = matching.map(n => n.id.toString())
    }
    
    // Fetch regular notes, excluding matching ones if they exist
    const excludeIds = matchingNoteIds.length > 0 ? matchingNoteIds : []
    const regularWhereClause = excludeIds.length > 0 
      ? {
          ...whereClause,
          id: { notIn: excludeIds }
        }
      : whereClause
    
    // Adjust limit and skip for regular notes
    const regularLimit = excludeIds.length > 0 ? limit - matchingNotes.length : limit
    const regularSkip = excludeIds.length > 0 ? skip : skip
    
    const notes = await prisma.note.findMany({
      where: regularWhereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: Math.max(0, regularLimit),
      skip: Math.max(0, regularSkip),
      select: {
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
        comments: {
          include: {
            user: {
              include: {
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
            createdAt: 'desc'
          }
        },
        user: {
          select: {
            id: true,
            friends: true,
            closeFriends: true,
            profiles: {
              select: {
                data: true
              }
            }
          }
        }
      }
    })

    // Combine matching notes first, then regular notes
    const allNotes = [...matchingNotes, ...notes]
    
    // Sort comments by likes, then by date
    const notesWithSortedComments = allNotes.map(note => {
      if (note.comments && Array.isArray(note.comments) && note.comments.length > 0) {
        const sortedComments = [...note.comments].sort((a: any, b: any) => {
          const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
          if (likeDiff !== 0) return likeDiff
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        return { ...note, comments: sortedComments }
      }
      return note
    })

    // Get current user's friends/closeFriends for relationship checking
    let currentUserFriends: string[] = []
    let currentUserCloseFriends: string[] = []
    let currentUserIdStr = ''
    
    if (userId) {
      const currentUserFull = await prisma.user.findUnique({
        where: { userId },
        select: {
          id: true,
          friends: true,
          closeFriends: true
        }
      })
      if (currentUserFull) {
        currentUserIdStr = currentUserFull.id.toString()
        currentUserFriends = (currentUserFull.friends || []).map((id: any) => id.toString())
        currentUserCloseFriends = (currentUserFull.closeFriends || []).map((id: any) => id.toString())
      }
    }

    // Filter out fields if not visible based on relationship
    // Also filter out notes without valid users
    const cleanedNotes = await Promise.all(notesWithSortedComments
      .filter((note: any) => note.user !== null) // Filter out notes without users
      .map(async (note) => {
      // Transform profiles[0] to profile for comments
      const commentsWithProfile = note.comments?.map((comment: any) => {
        const commentProfile = comment.user.profiles?.[0]
        const commentProfileData = commentProfile?.data || {}
        const commentProfileForFiltering = {
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
            profile: commentProfile ? filterProfileFields(commentProfileForFiltering, {
              isOwner: false,
              isFriend: false,
              isCloseFriend: false
            }) : null
        }
        }
      }) || []

      const profile = note.user.profiles?.[0]
      if (!profile) {
        // Ensure profile object exists even if null, so component can access profile.userName
        return {
          ...note,
          comments: commentsWithProfile,
          user: {
            ...note.user,
            profile: {
              userName: null
            }
          }
        }
      }

      // Check relationship between current user and note author
      const noteAuthorIdStr = note.user.id.toString()
      const isOwner = userId && currentUserIdStr === noteAuthorIdStr
      
      // Get note author's friends/closeFriends lists
      const noteAuthor = await prisma.user.findUnique({
        where: { id: note.user.id },
        select: {
          friends: true,
          closeFriends: true
        }
      })
      
      const noteAuthorFriends = (noteAuthor?.friends || []).map((id: any) => id.toString())
      const noteAuthorCloseFriends = (noteAuthor?.closeFriends || []).map((id: any) => id.toString())
      
      const isCloseFriend = !isOwner && userId && 
        noteAuthorCloseFriends.includes(currentUserIdStr) &&
        currentUserCloseFriends.includes(noteAuthorIdStr)
      
      const isFriend = !isOwner && !isCloseFriend && userId &&
        noteAuthorFriends.includes(currentUserIdStr) &&
        currentUserFriends.includes(noteAuthorIdStr)

      // Extract profile data from new structure and transform for filterProfileFields
      const profileData = profile.data || {}
      const profileForFiltering = {
        userName: profileData.username?.value || null,
        firstName: profileData.firstName?.value || null,
        lastName: profileData.lastName?.value || null,
        bio: profileData.bio?.value || null,
        profilePicture: profileData.profilePicture?.value || null,
        publicCharts: profileData.charts?.value || null,
        firstNameVisibility: profileData.firstName?.visibility ? 'PUBLIC' : 'PRIVATE',
        lastNameVisibility: profileData.lastName?.visibility ? 'PUBLIC' : 'PRIVATE',
        userNameVisibility: profileData.username?.visibility ? 'PUBLIC' : 'PRIVATE',
        bioVisibility: profileData.bio?.visibility ? 'PUBLIC' : 'PRIVATE',
        profilePictureVisibility: profileData.profilePicture?.visibility ? 'PUBLIC' : 'PRIVATE',
        publicChartsVisibility: profileData.charts?.visibility ? 'PUBLIC' : 'PRIVATE'
      }

      // Filter profile fields based on visibility and relationship
      const filteredProfile = filterProfileFields(profileForFiltering, {
        isOwner,
        isFriend,
        isCloseFriend
      })

      return {
        ...note,
        comments: commentsWithProfile,
        user: {
          ...note.user,
          profile: filteredProfile
        }
      }
    }))

    // Get total count for pagination
    const totalCount = await prisma.note.count({
      where: whereClause
    })

    const hasMore = skip + cleanedNotes.length < totalCount

    return NextResponse.json({ 
      notes: cleanedNotes, 
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

