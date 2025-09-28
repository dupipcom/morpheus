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
    const { friendId } = await req.json()

    if (!friendId) {
      return Response.json({ error: 'Friend ID is required' }, { status: 400 })
    }

    // Get the current user
    let currentUser = await prisma.user.findUnique({
      where: { userId }
    })

    if (!currentUser) {
      return Response.json({ error: 'Current user not found' }, { status: 404 })
    }

    // Check if the friend exists in the user's friends list
    if (!currentUser.friends?.includes(friendId)) {
      return Response.json({ error: 'Friend not found in your friends list' }, { status: 404 })
    }

    // Get the friend user
    const friendUser = await prisma.user.findUnique({
      where: { id: friendId }
    })

    if (!friendUser) {
      return Response.json({ error: 'Friend user not found' }, { status: 404 })
    }

    // Remove from friends list for both users
    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        friends: {
          set: currentUser.friends.filter(id => id !== friendId)
        }
      }
    })

    await prisma.user.update({
      where: { id: friendId },
      data: {
        friends: {
          set: friendUser.friends?.filter(id => id !== currentUser.id) || []
        }
      }
    })

    // Also remove from close friends if they were close friends
    if (currentUser.closeFriends?.includes(friendId)) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: {
          closeFriends: {
            set: currentUser.closeFriends.filter(id => id !== friendId)
          }
        }
      })
    }

    if (friendUser.closeFriends?.includes(currentUser.id)) {
      await prisma.user.update({
        where: { id: friendId },
        data: {
          closeFriends: {
            set: friendUser.closeFriends.filter(id => id !== currentUser.id)
          }
        }
      })
    }

    return Response.json({ 
      success: true, 
      message: 'Friend removed successfully' 
    })
  } catch (error) {
    console.error('Error removing friend:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
