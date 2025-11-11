import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('query') || '').trim()

    // Get the authenticated user to access their friends and close friends lists
    const { userId: clerkUserId } = await auth()
    
    let friendIds: string[] = []
    let closeFriendIds: string[] = []
    let currentUserId: string | null = null
    
    if (clerkUserId) {
      const currentUser = await prisma.user.findUnique({
        where: { userId: clerkUserId },
        select: {
          id: true,
          friends: true,
          closeFriends: true
        }
      })

      if (currentUser) {
        // friends and closeFriends arrays contain User ObjectId strings
        friendIds = currentUser.friends || []
        closeFriendIds = currentUser.closeFriends || []
        currentUserId = currentUser.id
      }
    }

    // Combine all friend IDs for the initial search
    const allFriendIds = [...new Set([...friendIds, ...closeFriendIds])]

    // Build search conditions based on whether there's a query or not
    const searchConditions = []
    
    // Fetch all profiles and filter in memory since we need to search in JSON data
    const allProfiles = await prisma.profile.findMany({
      where: {
        // Exclude the current user's own profile
        ...(currentUserId ? { userId: { not: currentUserId } } : {})
      },
      select: {
        userId: true,
        data: true,
      },
      take: 100 // Fetch more to ensure we have enough after filtering
    })

    // Filter profiles based on query and visibility
    let filteredProfiles = allProfiles.filter((profile: any) => {
      const profileData = profile.data || {}
      const userName = profileData.username?.value || ''
      const firstName = profileData.firstName?.value || ''
      const lastName = profileData.lastName?.value || ''
      const userNameVisible = profileData.username?.visibility || false
      const firstNameVisible = profileData.firstName?.visibility || false
      const lastNameVisible = profileData.lastName?.visibility || false

      // Check if user is a friend
      const isFriend = allFriendIds.includes(profile.userId)

      if (query) {
        // With query: search friends and public profiles matching the query
        const matchesQuery = 
          userName.toLowerCase().includes(query.toLowerCase()) ||
          firstName.toLowerCase().includes(query.toLowerCase()) ||
          lastName.toLowerCase().includes(query.toLowerCase())

        if (isFriend) {
          // Friends can see all fields regardless of visibility
          return matchesQuery
        } else {
          // For public profiles, only search visible fields
          return matchesQuery && (
            (userNameVisible && userName.toLowerCase().includes(query.toLowerCase())) ||
            (firstNameVisible && firstName.toLowerCase().includes(query.toLowerCase())) ||
            (lastNameVisible && lastName.toLowerCase().includes(query.toLowerCase()))
          )
        }
      } else {
        // Without query: show all friends and public profiles
        if (isFriend) {
          return true
        } else {
          // Show public profiles (at least one field is visible)
          return userNameVisible || firstNameVisible || lastNameVisible
        }
      }
    })

    // Transform profiles to extract data
    const profiles = filteredProfiles.map((profile: any) => {
      const profileData = profile.data || {}
      return {
        userId: profile.userId,
        userName: profileData.username?.value || null,
        firstName: profileData.firstName?.value || null,
        lastName: profileData.lastName?.value || null,
        profilePicture: profileData.profilePicture?.value || null,
        bio: profileData.bio?.value || null,
      }
    })

    // Sort profiles: close friends first, then friends, then public
    const sortedProfiles = profiles.sort((a, b) => {
      const aIsCloseFriend = closeFriendIds.includes(a.userId)
      const bIsCloseFriend = closeFriendIds.includes(b.userId)
      const aIsFriend = friendIds.includes(a.userId)
      const bIsFriend = friendIds.includes(b.userId)

      // Assign priority: close friend = 0, friend = 1, public = 2
      const aPriority = aIsCloseFriend ? 0 : aIsFriend ? 1 : 2
      const bPriority = bIsCloseFriend ? 0 : bIsFriend ? 1 : 2

      return aPriority - bPriority
    })

    // Add relationship flags to each profile
    const profilesWithRelationships = sortedProfiles.map(profile => ({
      ...profile,
      isCloseFriend: closeFriendIds.includes(profile.userId),
      isFriend: friendIds.includes(profile.userId)
    }))

    // Return only the first 5 results
    const topProfiles = profilesWithRelationships.slice(0, 5)

    return NextResponse.json({ profiles: topProfiles })
  } catch (error) {
    console.error('Error searching profiles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


