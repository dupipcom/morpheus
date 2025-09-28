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
    const { targetUserId } = await req.json()

    if (!targetUserId) {
      return Response.json({ error: 'Target user ID is required' }, { status: 400 })
    }

    // Get the current user, create if doesn't exist
    let currentUser = await prisma.user.findUnique({
      where: { userId }
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
        }
      })
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId }
    })

    if (!targetUser) {
      return Response.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Check if trying to add self as friend
    if (currentUser.id === targetUserId) {
      return Response.json({ error: 'Cannot add yourself as a friend' }, { status: 400 })
    }

    // Check if already friends
    if (currentUser.friends?.includes(targetUserId)) {
      return Response.json({ error: 'Already friends with this user' }, { status: 400 })
    }

    // Check if already in close friends
    if (currentUser.closeFriends?.includes(targetUserId)) {
      return Response.json({ error: 'Already close friends with this user' }, { status: 400 })
    }

    // Check if friend request already exists
    if (targetUser.friendRequests?.includes(currentUser.id)) {
      return Response.json({ error: 'Friend request already sent' }, { status: 400 })
    }

    // Add friend request to target user's friendRequests array
    await prisma.user.update({
      where: { id: targetUserId },
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
