import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const skip = (page - 1) * limit

    const { userId } = await auth()
    
    // Build where clause based on authentication and friendship status
    let whereClause: any = {
      OR: []
    }

    // Always include PUBLIC notes (from all users, including the authenticated user's own public notes)
    whereClause.OR.push({
      visibility: 'PUBLIC'
    })

    // If user is authenticated, include friends' and close friends' notes
    if (userId) {
      const currentUser = await prisma.user.findUnique({
        where: { userId },
        select: {
          id: true,
          friends: true,
          closeFriends: true
        }
      })

      if (currentUser) {
        const friendIds = currentUser.friends || []
        const closeFriendIds = currentUser.closeFriends || []

        // Include notes from friends with FRIENDS visibility
        if (friendIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'FRIENDS' },
              { userId: { in: friendIds } }
            ]
          })
        }

        // Include notes from close friends with CLOSE_FRIENDS visibility
        if (closeFriendIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'CLOSE_FRIENDS' },
              { userId: { in: closeFriendIds } }
            ]
          })
        }
      }
    }

    // Fetch notes with user profile info
    const notes = await prisma.note.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: skip,
      select: {
        id: true,
        content: true,
        visibility: true,
        createdAt: true,
        date: true,
        user: {
          select: {
            id: true,
            profile: {
              select: {
                userName: true,
                profilePicture: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    })

    // Get total count for pagination
    const totalCount = await prisma.note.count({
      where: whereClause
    })

    const hasMore = skip + notes.length < totalCount

    return NextResponse.json({ 
      notes, 
      hasMore,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit)
    })
  } catch (error) {
    console.error('Error fetching public notes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

