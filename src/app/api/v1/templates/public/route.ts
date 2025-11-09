import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { filterProfileFields } from '@/lib/profileUtils'

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

    // If user is authenticated, include templates from users who have the current user in their friends/closeFriends lists
    if (userId) {
      const currentUser = await prisma.user.findUnique({
        where: { userId },
        select: {
          id: true
        }
      })

      if (currentUser) {
        // Include current user's own templates with FRIENDS or CLOSE_FRIENDS visibility
        whereClause.OR.push({
          AND: [
            { owners: { has: currentUser.id } },
            { visibility: { in: ['FRIENDS', 'CLOSE_FRIENDS'] } }
          ]
        })

        // Find all users who have the current user in their friends list
        const usersWithCurrentUserAsFriend = await prisma.user.findMany({
          where: {
            friends: {
              has: currentUser.id
            }
          },
          select: {
            id: true
          }
        })
        const friendUserIds = usersWithCurrentUserAsFriend.map(u => u.id)

        // Find all users who have the current user in their closeFriends list
        const usersWithCurrentUserAsCloseFriend = await prisma.user.findMany({
          where: {
            closeFriends: {
              has: currentUser.id
            }
          },
          select: {
            id: true
          }
        })
        const closeFriendUserIds = usersWithCurrentUserAsCloseFriend.map(u => u.id)

        // Include templates from users who have current user in their friends list (FRIENDS visibility)
        if (friendUserIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'FRIENDS' },
              { owners: { hasSome: friendUserIds } }
            ]
          })
        }

        // Include templates from users who have current user in their closeFriends list (CLOSE_FRIENDS visibility)
        if (closeFriendUserIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'CLOSE_FRIENDS' },
              { owners: { hasSome: closeFriendUserIds } }
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


    // Get current user's friends/closeFriends for relationship checking
    let currentUserFriends: string[] = []
    let currentUserCloseFriends: string[] = []
    let currentUserIdStr = ''
    
    if (userId) {
      const currentUserFull = await prisma.user.findUnique({
        where: { userId },
        select: {
          id: true,
          friends: true,
          closeFriends: true
        }
      })
      if (currentUserFull) {
        currentUserIdStr = currentUserFull.id.toString()
        currentUserFriends = (currentUserFull.friends || []).map((id: any) => id.toString())
        currentUserCloseFriends = (currentUserFull.closeFriends || []).map((id: any) => id.toString())
      }
    }

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
                profilePictureVisibility: true,
                firstName: true,
                firstNameVisibility: true,
                lastName: true,
                lastNameVisibility: true,
                bio: true,
                bioVisibility: true
              }
            }
          }
        })

        // Filter out fields if not visible based on relationship
        let cleanedUser = null
        if (user) {
          if (!user.profile) {
            // Ensure profile object exists even if null, so component can access profile.userName
            cleanedUser = {
              ...user,
              profile: {
                userName: null
              }
            }
          } else {
            // Check relationship between current user and template owner
            const ownerIdStr = user.id.toString()
            const isOwner = userId && currentUserIdStr === ownerIdStr
            
            // Get template owner's friends/closeFriends lists
            const ownerUser = await prisma.user.findUnique({
              where: { id: ownerId },
              select: {
                friends: true,
                closeFriends: true
              }
            })
            
            const ownerFriends = (ownerUser?.friends || []).map((id: any) => id.toString())
            const ownerCloseFriends = (ownerUser?.closeFriends || []).map((id: any) => id.toString())
            
            const isCloseFriend = !isOwner && userId && 
              ownerCloseFriends.includes(currentUserIdStr) &&
              currentUserCloseFriends.includes(ownerIdStr)
            
            const isFriend = !isOwner && !isCloseFriend && userId &&
              ownerFriends.includes(currentUserIdStr) &&
              currentUserFriends.includes(ownerIdStr)

            // Filter profile fields based on visibility and relationship
            const profile = filterProfileFields(user.profile, {
              isOwner,
              isFriend,
              isCloseFriend
            })

            cleanedUser = {
              ...user,
              profile
            }
          }
        }

        return {
          ...template,
          user: cleanedUser
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

