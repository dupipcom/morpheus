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
    const { searchParams } = new URL(req.url)
    const targetUserName = searchParams.get('targetUserName')

    if (!targetUserName) {
      return Response.json({ error: 'Target username is required' }, { status: 400 })
    }

    // Get the current user
    let currentUser = await prisma.user.findUnique({
      where: { userId },
      include: { profile: true }
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
        include: { profile: true }
      })
    }

    // Ensure current user has a profile - create one if missing
    if (currentUser && !currentUser.profile) {
      try {
        await prisma.profile.create({
          data: {
            userId: currentUser.id,
            userName: null, // No Clerk username available in this context
            firstNameVisibility: 'PRIVATE',
            lastNameVisibility: 'PRIVATE',
            userNameVisibility: 'PUBLIC',
            bioVisibility: 'PRIVATE',
            profilePictureVisibility: 'PRIVATE',
            publicChartsVisibility: 'PRIVATE',
          }
        })
        // Refetch user with new profile
        currentUser = await prisma.user.findUnique({
          where: { userId },
          include: { profile: true }
        })
      } catch (error) {
        console.error('Error creating profile in friendship-status endpoint:', error)
      }
    }

    // Get target user by username
    const targetUser = await prisma.user.findFirst({
      where: { 
        profile: {
          userName: targetUserName
        }
      }
    })

    if (!targetUser) {
      return Response.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Check if users are already friends
    const isFriend = currentUser.friends?.includes(targetUser.id) || false
    const isCloseFriend = currentUser.closeFriends?.includes(targetUser.id) || false
    const hasPendingRequest = currentUser.friendRequests?.includes(targetUser.id) || false

    return Response.json({ 
      isFriend,
      isCloseFriend,
      hasPendingRequest,
      friendshipStatus: isCloseFriend ? 'close_friend' : isFriend ? 'friend' : hasPendingRequest ? 'pending' : 'none'
    })
  } catch (error) {
    console.error('Error checking friendship status:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
