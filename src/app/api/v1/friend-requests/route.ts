import prisma from "@/lib/prisma";
import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const { userId } = await auth()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  try {
    // Get the current user with friend requests
    let currentUser = await prisma.user.findUnique({
      where: { userId },
      include: {
        profile: true
      }
    })

    if (!currentUser) {
      // Create user if they don't exist in database
      currentUser = await prisma.user.create({
        data: {
          userId,
          entries: {},
          settings: {
            dailyTemplate: [],
            weeklyTemplate: []
          }
        },
        include: {
          profile: true
        }
      })
    }

    // Ensure current user has a profile - create one if missing
    if (currentUser && !currentUser.profile) {
      try {
        await prisma.profile.create({
          data: {
            userId: currentUser.id,
            userName: null, // No Clerk username available in this context
            firstNameVisible: false,
            lastNameVisible: false,
            userNameVisible: false,
            bioVisible: false,
            profilePictureVisible: false,
            publicChartsVisible: false,
          }
        })
        // Refetch user with new profile
        currentUser = await prisma.user.findUnique({
          where: { userId },
          include: { profile: true }
        })
      } catch (error) {
        console.error('Error creating profile in friend-requests endpoint:', error)
      }
    }

    // Get friend requests with user details
    const friendRequestIds = currentUser.friendRequests || []
    
    if (friendRequestIds.length === 0) {
      return Response.json({ friendRequests: [] })
    }

    const friendRequests = await prisma.user.findMany({
      where: {
        id: {
          in: friendRequestIds
        }
      },
      include: {
        profile: true
      }
    })

    // Format the response with user details
    const formattedRequests = friendRequests.map(user => ({
      id: user.id,
      userId: user.userId,
      profile: user.profile ? {
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        userName: user.profile.userName,
        profilePicture: user.profile.profilePicture,
        bio: user.profile.bio
      } : null
    }))

    return Response.json({ friendRequests: formattedRequests })
  } catch (error) {
    console.error('Error fetching friend requests:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
