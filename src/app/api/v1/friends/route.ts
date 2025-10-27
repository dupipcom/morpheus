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
    // Get the current user with friends
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
        console.error('Error creating profile in friends endpoint:', error)
      }
    }

    // Get friends with user details
    const friendIds = currentUser.friends || []
    
    if (friendIds.length === 0) {
      return Response.json({ friends: [] })
    }

    const friends = await prisma.user.findMany({
      where: {
        id: {
          in: friendIds
        }
      },
      include: {
        profile: true
      }
    })

    // Format the response with user details
    const formattedFriends = friends.map(user => ({
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

    return Response.json({ friends: formattedFriends })
  } catch (error) {
    console.error('Error fetching friends:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
