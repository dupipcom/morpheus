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
      include: { profiles: true }
    })

    if (!currentUser) {
      // Create user if they don't exist in database
      currentUser = await prisma.user.create({
        data: {
          userId,
          settings: {
            currency: null,
            speed: null
          } as any
        },
        include: { profiles: true }
      })
    }

    // Ensure current user has a profile - create one if missing
    if (currentUser && (!currentUser.profiles || currentUser.profiles.length === 0)) {
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
          include: { profiles: true }
        })
      } catch (error) {
        console.error('Error creating profile in friendship-status endpoint:', error)
      }
    }

    // Get target user by username
    const targetProfile = await prisma.profile.findUnique({
      where: { userName: targetUserName }
    })
    const targetUser = targetProfile ? await prisma.user.findUnique({
      where: { id: targetProfile.userId }
    }) : null

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
