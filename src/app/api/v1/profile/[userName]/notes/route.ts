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

    // Get current user's ID if logged in
    let currentUserId = null
    if (userId) {
      const currentUser = await prisma.user.findUnique({
        where: { userId },
        select: { id: true }
      })
      currentUserId = currentUser?.id
    }

    // Determine which notes the current user can see
    let visibilityFilter = ['PUBLIC'] // Everyone can see public notes

    if (currentUserId) {
      // If user is logged in, they can see more notes based on relationship
      const isOwnProfile = profile.user.id === currentUserId
      const isFriend = profile.user.friends.includes(currentUserId)
      const isCloseFriend = profile.user.closeFriends.includes(currentUserId)

      if (isOwnProfile) {
        // User can see all their own notes
        visibilityFilter = ['PRIVATE', 'FRIENDS', 'CLOSE_FRIENDS', 'PUBLIC']
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
        date: true
      }
    })

    return Response.json({ notes })
  } catch (error) {
    console.error('Error fetching public notes:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
