import prisma from "@/lib/prisma";
import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { filterProfileFields } from "@/lib/profileUtils"

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
        profiles: true
      }
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
        include: {
          profile: true
        }
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
        profiles: true
      }
    })

    // Format the response with user details
    const formattedFriends = friends.map(user => {
      const profile = user.profiles?.[0]
      if (!profile) {
        return {
          id: user.id,
          userId: user.userId,
          profile: null
        }
      }

      // Check if current user is friend/close friend with this user
      const currentUserIdStr = currentUser.id.toString()
      const friendUserIdStr = user.id.toString()
      const currentUserFriends = (currentUser.friends || []).map((id: any) => id.toString())
      const currentUserCloseFriends = (currentUser.closeFriends || []).map((id: any) => id.toString())
      const friendUserFriends = (user.friends || []).map((id: any) => id.toString())
      const friendUserCloseFriends = (user.closeFriends || []).map((id: any) => id.toString())
      
      const isCloseFriend = currentUserCloseFriends.includes(friendUserIdStr) && friendUserCloseFriends.includes(currentUserIdStr)
      const isFriend = !isCloseFriend && currentUserFriends.includes(friendUserIdStr) && friendUserFriends.includes(currentUserIdStr)

      // Filter profile fields based on visibility and relationship
      const filteredProfile = filterProfileFields(profile, {
        isOwner: false,
        isFriend,
        isCloseFriend
      })

      return {
        id: user.id,
        userId: user.userId,
        profile: filteredProfile
      }
    })

    return Response.json({ friends: formattedFriends })
  } catch (error) {
    console.error('Error fetching friends:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
