import prisma from "@/lib/prisma";
import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { userId } = await auth()

  // Check if user is authenticated
  if (!userId) {
    return Response.json({ error: 'User not authenticated' }, { status: 401 })
  }

  try {
    const { targetUserName } = await req.json()

    if (!targetUserName) {
      return Response.json({ error: 'Target username is required' }, { status: 400 })
    }

    // Get the current user, create if doesn't exist
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

    // Check if target user exists by username using root-level username field
    const targetProfile = await prisma.profile.findUnique({
      where: {
        username: targetUserName
      }
    })
    const targetUser = targetProfile ? await prisma.user.findUnique({
      where: { id: targetProfile.userId }
    }) : null

    if (!targetUser) {
      return Response.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Check if trying to add self as friend
    const currentUserProfileData = currentUser.profiles?.[0]?.data || {}
    const currentUserName = currentUserProfileData.username?.value || currentUser.profiles?.[0]?.username
    if (currentUserName === targetUserName) {
      return Response.json({ error: 'friendRequestSelfError' }, { status: 400 })
    }

    // Check if already friends
    if (currentUser.friends?.includes(targetUser.id)) {
      return Response.json({ error: 'Already friends with this user' }, { status: 400 })
    }

    // Check if already in close friends
    if (currentUser.closeFriends?.includes(targetUser.id)) {
      return Response.json({ error: 'Already close friends with this user' }, { status: 400 })
    }

    // Check if friend request already exists
    if (targetUser.friendRequests?.includes(currentUser.id)) {
      return Response.json({ error: 'Friend request already sent' }, { status: 400 })
    }

    // Add friend request to target user's friendRequests array
    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        friendRequests: {
          push: currentUser.id
        }
      }
    })

    return Response.json({ 
      success: true, 
      message: 'Friend request sent successfully' 
    })
  } catch (error) {
    console.error('Error sending friend request:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
