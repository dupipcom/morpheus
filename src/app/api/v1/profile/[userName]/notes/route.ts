import prisma from "@/lib/prisma";
import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ userName: string }> }) {
  try {
    const { userName } = await params
    const { userId } = await auth()

    // Find the profile to get the user ID
    const profile = await prisma.profile.findUnique({
      where: { userName },
      include: {
        user: {
          select: {
            id: true,
            friends: true,
            closeFriends: true
          }
        }
      }
    })

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get current user's ID and friends list if logged in
    let currentUserId = null
    let currentUserFriends = []
    let currentUserCloseFriends = []
    if (userId) {
      const currentUser = await prisma.user.findUnique({
        where: { userId },
        select: { 
          id: true,
          friends: true,
          closeFriends: true
        }
      })
      currentUserId = currentUser?.id
      currentUserFriends = currentUser?.friends || []
      currentUserCloseFriends = currentUser?.closeFriends || []
    }

    // Determine which notes the current user can see
    let visibilityFilter = ['PUBLIC'] // Everyone can see public notes

    if (currentUserId) {
      // If user is logged in, they can see more notes based on relationship
      const isOwnProfile = profile.user.id === currentUserId
      
      // Check bidirectional friendship - both users must have each other in their friends list
      const isFriend = profile.user.friends.includes(currentUserId) && currentUserFriends.includes(profile.user.id)
      const isCloseFriend = profile.user.closeFriends.includes(currentUserId) && currentUserCloseFriends.includes(profile.user.id)

      if (isOwnProfile) {
        // User can see all their own notes
        visibilityFilter = ['PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC', 'AI_ENABLED']
      } else if (isCloseFriend) {
        // Close friends can see close friends and public notes
        visibilityFilter = ['CLOSE_FRIENDS', 'PUBLIC']
      } else if (isFriend) {
        // Friends can see friends and public notes
        visibilityFilter = ['FRIENDS', 'PUBLIC']
      }
    }

    // Fetch notes based on visibility
    const notes = await prisma.note.findMany({
      where: {
        userId: profile.user.id,
        visibility: {
          in: visibilityFilter as any
        }
      },
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
              select: {
                id: true,
                profile: {
                  select: {
                    userName: true,
                    profilePicture: true,
                    firstName: true,
                    lastName: true
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
        }
      }
    })

    // Get all note IDs to check if current user has liked them
    const noteIds = notes.map(note => note.id)
    let userLikedNoteIds: string[] = []
    
    if (currentUserId && noteIds.length > 0) {
      const userLikes = await prisma.like.findMany({
        where: {
          userId: currentUserId,
          entityType: 'note',
          entityId: {
            in: noteIds
          }
        },
        select: {
          entityId: true
        }
      })
      userLikedNoteIds = userLikes.map(like => like.entityId)
    }

    // Sort comments by likes, then by date, and add isLiked status
    const notesWithSortedComments = notes.map(note => {
      const isLiked = userLikedNoteIds.includes(note.id)
      
      if (note.comments && Array.isArray(note.comments) && note.comments.length > 0) {
        const sortedComments = [...note.comments].sort((a: any, b: any) => {
          const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
          if (likeDiff !== 0) return likeDiff
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        return { ...note, comments: sortedComments, isLiked }
      }
      return { ...note, isLiked }
    })

    return Response.json({ notes: notesWithSortedComments })
  } catch (error) {
    console.error('Error fetching public notes:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
