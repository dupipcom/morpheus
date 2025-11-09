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

    // Always include public templates
    whereClause.OR.push({
      visibility: 'PUBLIC'
    })

    // If user is authenticated, include friends' and close friends' templates
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

        // Include templates from friends with FRIENDS visibility
        if (friendIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'FRIENDS' },
              { owners: { hasSome: friendIds } }
            ]
          })
        }

        // Include templates from close friends with CLOSE_FRIENDS visibility
        if (closeFriendIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'CLOSE_FRIENDS' },
              { owners: { hasSome: closeFriendIds } }
            ]
          })
        }
      }
    }

    // If no OR conditions (shouldn't happen, but handle edge case)
    if (whereClause.OR.length === 0) {
      whereClause = { visibility: 'PUBLIC' }
    }

    // Fetch templates
    const templates = await prisma.template.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: skip,
      select: {
        id: true,
        name: true,
        role: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        owners: true
      }
    })

    // Get the user profiles for each template owner
    const templatesWithUsers = await Promise.all(
      templates.map(async (template) => {
        // Get the first owner's profile (for now, we'll use the first owner)
        const ownerId = template.owners[0]
        if (!ownerId) {
          return {
            ...template,
            user: null
          }
        }

        const user = await prisma.user.findUnique({
          where: { id: ownerId },
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
        })

        return {
          ...template,
          user: user || null
        }
      })
    )

    // Get total count for pagination
    const totalCount = await prisma.template.count({
      where: whereClause
    })

    const hasMore = skip + templatesWithUsers.length < totalCount

    return NextResponse.json({ 
      templates: templatesWithUsers, 
      hasMore,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit)
    })
  } catch (error) {
    console.error('Error fetching public templates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

