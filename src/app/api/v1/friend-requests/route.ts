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
    // Get the current user with friend requests
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
        profiles: true
      }
    })

    // Format the response with user details
    const formattedRequests = friendRequests.map(user => {
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
      const requestUserIdStr = user.id.toString()
      const currentUserFriends = (currentUser.friends || []).map((id: any) => id.toString())
      const currentUserCloseFriends = (currentUser.closeFriends || []).map((id: any) => id.toString())
      const requestUserFriends = (user.friends || []).map((id: any) => id.toString())
      const requestUserCloseFriends = (user.closeFriends || []).map((id: any) => id.toString())
      
      const isCloseFriend = currentUserCloseFriends.includes(requestUserIdStr) && requestUserCloseFriends.includes(currentUserIdStr)
      const isFriend = !isCloseFriend && currentUserFriends.includes(requestUserIdStr) && requestUserFriends.includes(currentUserIdStr)

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

    return Response.json({ friendRequests: formattedRequests })
  } catch (error) {
    console.error('Error fetching friend requests:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
