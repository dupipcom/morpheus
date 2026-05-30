import prisma from "@/lib/prisma";
import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import { filterProfileFields } from "@/lib/utils/profileUtils"

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
            data: {
              username: {
                value: null,
                visibility: true
              },
              firstName: {
                value: null,
                visibility: false
              },
              lastName: {
                value: null,
                visibility: false
              },
              bio: {
                value: null,
                visibility: false
              },
              profilePicture: {
                value: null,
                visibility: false
              }
            }
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

      // Extract profile data from the new structure and transform for filterProfileFields
      const profileData = profile.data || {}
      const profileForFiltering = {
        userName: profileData.username?.value || null,
        firstName: profileData.firstName?.value || null,
        lastName: profileData.lastName?.value || null,
        bio: profileData.bio?.value || null,
        profilePicture: profileData.profilePicture?.value || null,
        publicCharts: profileData.charts?.value || null,
        firstNameVisibility: profileData.firstName?.visibility ? 'PUBLIC' : 'PRIVATE',
        lastNameVisibility: profileData.lastName?.visibility ? 'PUBLIC' : 'PRIVATE',
        userNameVisibility: profileData.username?.visibility ? 'PUBLIC' : 'PRIVATE',
        bioVisibility: profileData.bio?.visibility ? 'PUBLIC' : 'PRIVATE',
        profilePictureVisibility: profileData.profilePicture?.visibility ? 'PUBLIC' : 'PRIVATE',
        publicChartsVisibility: profileData.charts?.visibility ? 'PUBLIC' : 'PRIVATE'
      }

      // Filter profile fields based on visibility and relationship
      const filteredProfile = filterProfileFields(profileForFiltering, {
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
