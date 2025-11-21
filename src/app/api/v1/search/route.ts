import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') || '').trim()

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] })
    }

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { userId: clerkUserId },
      select: {
        id: true,
        friends: true,
        closeFriends: true
      }
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const allFriendIds = [...new Set([...(currentUser.friends || []), ...(currentUser.closeFriends || [])])]

    // Use MongoDB aggregation with $search for Atlas Search
    // Access MongoDB client through Prisma
    const results: any[] = []

    // Try to get MongoDB client from Prisma
    let db: any = null
    try {
      // Prisma MongoDB client access pattern
      const client = await (prisma as any).$connect()
      db = (prisma as any)._client?.db || (prisma as any).$client?.db
    } catch (error) {
      console.error('Error accessing MongoDB client:', error)
    }

    if (!db) {
      // Fallback to Prisma queries if raw MongoDB access is not available
      return await fallbackSearch(query, currentUser.id, allFriendIds)
    }

    // Search Lists using listSearch index
    try {
      const listResults = await db.collection('List').aggregate([
        {
          $search: {
            index: 'listSearch',
            text: {
              query: query,
              path: ['name', 'role']
            }
          }
        },
        {
          $match: {
            $or: [
              { 'users.userId': currentUser.id },
              { visibility: 'PUBLIC' },
              { 
                $and: [
                  { visibility: 'FRIENDS' },
                  { 'users.userId': { $in: allFriendIds } }
                ]
              },
              { 
                $and: [
                  { visibility: 'CLOSE_FRIENDS' },
                  { 'users.userId': { $in: currentUser.closeFriends || [] } }
                ]
              }
            ]
          }
        },
        {
          $limit: 5
        },
        {
          $project: {
            id: { $toString: '$_id' },
            name: 1,
            role: 1,
            type: { $literal: 'list' }
          }
        }
      ]).toArray()

      results.push(...listResults.map((item: any) => ({
        id: item.id,
        name: item.name || item.role || 'Untitled List',
        type: 'list',
        role: item.role
      })))
    } catch (error) {
      console.error('Error searching lists:', error)
    }

    // Search Profiles using profileSearch index
    try {
      const profileResults = await db.collection('Profile').aggregate([
        {
          $search: {
            index: 'profileSearch',
            text: {
              query: query,
              path: ['data.username.value', 'data.firstName.value', 'data.lastName.value', 'username']
            }
          }
        },
        {
          $match: {
            userId: { $ne: currentUser.id }
          }
        },
        {
          $limit: 10
        },
        {
          $project: {
            id: { $toString: '$_id' },
            userId: { $toString: '$userId' },
            username: 1,
            data: 1,
            type: { $literal: 'profile' }
          }
        }
      ]).toArray()

      // Filter profiles based on visibility
      const filteredProfiles = profileResults.filter((profile: any) => {
        const profileData = profile.data || {}
        const userName = profileData.username?.value || profile.username || ''
        const firstName = profileData.firstName?.value || ''
        const lastName = profileData.lastName?.value || ''
        const userNameVisible = profileData.username?.visibility || false
        const firstNameVisible = profileData.firstName?.visibility || false
        const lastNameVisible = profileData.lastName?.visibility || false

        const isFriend = allFriendIds.includes(profile.userId)

        if (isFriend) {
          return true
        } else {
          // For public profiles, only show if at least one matching field is visible
          const matchesQuery = 
            userName.toLowerCase().includes(query.toLowerCase()) ||
            firstName.toLowerCase().includes(query.toLowerCase()) ||
            lastName.toLowerCase().includes(query.toLowerCase())
          
          return matchesQuery && (
            (userNameVisible && userName.toLowerCase().includes(query.toLowerCase())) ||
            (firstNameVisible && firstName.toLowerCase().includes(query.toLowerCase())) ||
            (lastNameVisible && lastName.toLowerCase().includes(query.toLowerCase()))
          )
        }
      })

      results.push(...filteredProfiles.slice(0, 5).map((item: any) => {
        const profileData = item.data || {}
        return {
          id: item.userId,
          name: profileData.username?.value || profileData.firstName?.value || profileData.lastName?.value || 'Anonymous',
          type: 'profile',
          username: profileData.username?.value || item.username,
          firstName: profileData.firstName?.value,
          lastName: profileData.lastName?.value,
          profilePicture: profileData.profilePicture?.value
        }
      }))
    } catch (error) {
      console.error('Error searching profiles:', error)
    }

    // Search Notes using noteSearch index
    try {
      const noteResults = await db.collection('Note').aggregate([
        {
          $search: {
            index: 'noteSearch',
            text: {
              query: query,
              path: 'content'
            }
          }
        },
        {
          $match: {
            $or: [
              { userId: currentUser.id },
              { visibility: 'PUBLIC' },
              { 
                $and: [
                  { visibility: 'FRIENDS' },
                  { userId: { $in: allFriendIds } }
                ]
              },
              { 
                $and: [
                  { visibility: 'CLOSE_FRIENDS' },
                  { userId: { $in: currentUser.closeFriends || [] } }
                ]
              }
            ]
          }
        },
        {
          $limit: 5
        },
        {
          $project: {
            id: { $toString: '$_id' },
            content: 1,
            date: 1,
            type: { $literal: 'note' }
          }
        }
      ]).toArray()

      results.push(...noteResults.map((item: any) => ({
        id: item.id,
        name: item.content?.substring(0, 100) || 'Untitled Note',
        type: 'note',
        content: item.content,
        date: item.date
      })))
    } catch (error) {
      console.error('Error searching notes:', error)
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error in search:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Fallback search using Prisma when raw MongoDB access is not available
async function fallbackSearch(query: string, userId: string, friendIds: string[]) {
  const results: any[] = []

  // Search Lists
  try {
    const lists = await prisma.list.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { role: { contains: query, mode: 'insensitive' } }
            ]
          },
          {
            OR: [
              { users: { some: { userId } } },
              { visibility: 'PUBLIC' },
              { visibility: 'FRIENDS', users: { some: { userId: { in: friendIds } } } },
              { visibility: 'CLOSE_FRIENDS', users: { some: { userId: { in: friendIds } } } }
            ]
          }
        ]
      },
      take: 5,
      select: {
        id: true,
        name: true,
        role: true
      }
    })

    results.push(...lists.map(list => ({
      id: list.id,
      name: list.name || list.role || 'Untitled List',
      type: 'list',
      role: list.role
    })))
  } catch (error) {
    console.error('Error in fallback list search:', error)
  }

  // Search Profiles
  try {
    const profiles = await prisma.profile.findMany({
      where: {
        userId: { not: userId }
      },
      take: 20,
      select: {
        userId: true,
        username: true,
        data: true
      }
    })

    const filteredProfiles = profiles.filter((profile: any) => {
      const profileData = profile.data || {}
      const userName = profileData.username?.value || profile.username || ''
      const firstName = profileData.firstName?.value || ''
      const lastName = profileData.lastName?.value || ''
      
      const matchesQuery = 
        userName.toLowerCase().includes(query.toLowerCase()) ||
        firstName.toLowerCase().includes(query.toLowerCase()) ||
        lastName.toLowerCase().includes(query.toLowerCase())

      if (!matchesQuery) return false

      const isFriend = friendIds.includes(profile.userId)
      if (isFriend) return true

      const userNameVisible = profileData.username?.visibility || false
      const firstNameVisible = profileData.firstName?.visibility || false
      const lastNameVisible = profileData.lastName?.visibility || false

      return (userNameVisible && userName.toLowerCase().includes(query.toLowerCase())) ||
             (firstNameVisible && firstName.toLowerCase().includes(query.toLowerCase())) ||
             (lastNameVisible && lastName.toLowerCase().includes(query.toLowerCase()))
    })

    results.push(...filteredProfiles.slice(0, 5).map((profile: any) => {
      const profileData = profile.data || {}
      return {
        id: profile.userId,
        name: profileData.username?.value || profileData.firstName?.value || profileData.lastName?.value || 'Anonymous',
        type: 'profile',
        username: profileData.username?.value || profile.username,
        firstName: profileData.firstName?.value,
        lastName: profileData.lastName?.value,
        profilePicture: profileData.profilePicture?.value
      }
    }))
  } catch (error) {
    console.error('Error in fallback profile search:', error)
  }

  // Search Notes
  try {
    const notes = await prisma.note.findMany({
      where: {
        OR: [
          { userId },
          { visibility: 'PUBLIC' },
          { visibility: 'FRIENDS', userId: { in: friendIds } },
          { visibility: 'CLOSE_FRIENDS', userId: { in: friendIds } }
        ],
        content: { contains: query, mode: 'insensitive' }
      },
      take: 5,
      select: {
        id: true,
        content: true,
        date: true
      }
    })

    results.push(...notes.map(note => ({
      id: note.id,
      name: note.content?.substring(0, 100) || 'Untitled Note',
      type: 'note',
      content: note.content,
      date: note.date
    })))
  } catch (error) {
    console.error('Error in fallback note search:', error)
  }

  return NextResponse.json({ results })
}

