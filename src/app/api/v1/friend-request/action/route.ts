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
    const { action, requesterId } = await req.json()

    if (!action || !requesterId) {
      return Response.json({ error: 'Action and requester ID are required' }, { status: 400 })
    }

    if (!['accept', 'decline'].includes(action)) {
      return Response.json({ error: 'Invalid action. Must be accept or decline' }, { status: 400 })
    }

    // Get the current user
    let currentUser = await prisma.user.findUnique({
      where: { userId }
    })

    if (!currentUser) {
      return Response.json({ error: 'Current user not found' }, { status: 404 })
    }

    // Check if the requester is in friend requests
    if (!currentUser.friendRequests?.includes(requesterId)) {
      return Response.json({ error: 'Friend request not found' }, { status: 404 })
    }

    // Get the requester user
    const requesterUser = await prisma.user.findUnique({
      where: { id: requesterId }
    })

    if (!requesterUser) {
      return Response.json({ error: 'Requester user not found' }, { status: 404 })
    }

    if (action === 'accept') {
      // Remove from friend requests and add to friends for both users
      await prisma.user.update({
        where: { id: currentUser.id },
        data: {
          friendRequests: {
            set: currentUser.friendRequests.filter(id => id !== requesterId)
          },
          friends: {
            push: requesterId
          }
        }
      })

      await prisma.user.update({
        where: { id: requesterId },
        data: {
          friends: {
            push: currentUser.id
          }
        }
      })
    } else {
      // Just remove from friend requests
      await prisma.user.update({
        where: { id: currentUser.id },
        data: {
          friendRequests: {
            set: currentUser.friendRequests.filter(id => id !== requesterId)
          }
        }
      })
    }

    return Response.json({ 
      success: true, 
      message: `Friend request ${action}ed successfully` 
    })
  } catch (error) {
    console.error('Error handling friend request:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
