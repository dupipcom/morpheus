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
      }
    }

    // Combine all friend IDs for the initial search
    const allFriendIds = [...new Set([...friendIds, ...closeFriendIds])]

    // Build search conditions based on whether there's a query or not
    const searchConditions = []
    
    if (query) {
      // With query: search friends and public profiles matching the query
      
      // For friends and close friends, search all fields regardless of visibility
      if (allFriendIds.length > 0) {
        searchConditions.push({
          userId: { in: allFriendIds },
          OR: [
            { userName: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } }
          ]
        })
      }
      
      // For public profiles, only search visible fields
      searchConditions.push({
        OR: [
          {
            userNameVisible: true,
            userName: { contains: query, mode: 'insensitive' }
          },
          {
            firstNameVisible: true,
            firstName: { contains: query, mode: 'insensitive' }
          },
          {
            lastNameVisible: true,
            lastName: { contains: query, mode: 'insensitive' }
          },
        ]
      })
    } else {
      // Without query: show all friends and public profiles as suggestions
      
      // Show all friends (no search filter)
      if (allFriendIds.length > 0) {
        searchConditions.push({
          userId: { in: allFriendIds }
        })
      }
      
      // Show all public profiles (no search filter)
      searchConditions.push({
        OR: [
          { userNameVisible: true },
          { firstNameVisible: true },
          { lastNameVisible: true }
        ]
      })
    }

    // If no search conditions, return empty
    if (searchConditions.length === 0) {
      return NextResponse.json({ profiles: [] })
    }

    const profiles = await prisma.profile.findMany({
      where: {
        OR: searchConditions
      },
      select: {
        userId: true,
        userName: true,
        firstName: true,
        lastName: true,
      },
      take: 50 // Fetch more to ensure we have enough after sorting
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

    // Return only the first 5 results
    const topProfiles = sortedProfiles.slice(0, 5)

    return NextResponse.json({ profiles: topProfiles })
  } catch (error) {
    console.error('Error searching profiles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


