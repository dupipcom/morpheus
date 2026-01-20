import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { filterProfileFields } from '@/lib/utils/profileUtils'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const skip = (page - 1) * limit
    const filterTemplateId = searchParams.get('templateId') || searchParams.get('listId')
    const filterProfileId = searchParams.get('profileId')

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
            { users: { some: { userId: currentUser.id, role: 'OWNER' } } },
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
              {
                OR: friendUserIds.map(id => ({
                  users: { some: { userId: id, role: 'OWNER' } }
                }))
              }
            ]
          })
        }

        // Include templates from users who have current user in their closeFriends list (CLOSE_FRIENDS visibility)
        if (closeFriendUserIds.length > 0) {
          whereClause.OR.push({
            AND: [
              { visibility: 'CLOSE_FRIENDS' },
              {
                OR: closeFriendUserIds.map(id => ({
                  users: { some: { userId: id, role: 'OWNER' } }
                }))
              }
            ]
          })
        }
      }
    }

    // If no OR conditions (shouldn't happen, but handle edge case)
    if (whereClause.OR.length === 0) {
      whereClause = { visibility: 'PUBLIC' }
    }

    // Build filter for matching items (templateId/listId or profileId)
    let matchingTemplates: any[] = []
    let matchingTemplateIds: string[] = []
    
    if (filterTemplateId || filterProfileId) {
      const matchingWhereClause: any = {
        ...whereClause
      }
      
      // Add specific filters
      if (filterTemplateId) {
        matchingWhereClause.id = filterTemplateId
      }
      if (filterProfileId) {
        // Convert profileId (userId) to user's internal ID if needed
        const profileUser = await prisma.user.findFirst({
          where: {
            OR: [
              { id: filterProfileId },
              { userId: filterProfileId }
            ]
          },
          select: { id: true }
        })
        if (profileUser) {
          matchingWhereClause.users = {
            some: {
              userId: profileUser.id,
              role: 'OWNER'
            }
          }
        }
      }
      
      // Fetch matching templates first (no pagination, get all matches)
      const matching = await prisma.template.findMany({
        where: matchingWhereClause,
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          id: true,
          name: true,
          role: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          users: true,
          _count: {
            select: {
              comments: true,
              likes: true
            }
          },
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  profiles: {
                    select: {
                      data: true
                    }
                  }
                }
              },
              _count: {
                select: {
                  likes: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      })
      
      matchingTemplates = matching
      matchingTemplateIds = matching.map(t => t.id.toString())
    }
    
    // Fetch regular templates, excluding matching ones if they exist
    const excludeIds = matchingTemplateIds.length > 0 ? matchingTemplateIds : []
    const regularWhereClause = excludeIds.length > 0 
      ? {
          ...whereClause,
          id: { notIn: excludeIds }
        }
      : whereClause
    
    // Adjust limit and skip for regular templates
    const regularLimit = excludeIds.length > 0 ? limit - matchingTemplates.length : limit
    const regularSkip = excludeIds.length > 0 ? skip : skip
    
    // Fetch templates
    const templates = await prisma.template.findMany({
      where: regularWhereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: Math.max(0, regularLimit),
      skip: Math.max(0, regularSkip),
      select: {
        id: true,
        name: true,
        role: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        users: true,
        _count: {
          select: {
            comments: true,
            likes: true
          }
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                profiles: {
                  select: {
                    data: true
                  }
                }
              }
            },
            _count: {
              select: {
                likes: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    // Combine matching templates first, then regular templates
    const allTemplates = [...matchingTemplates, ...templates]
    
    // Sort comments by likes, then by date, and transform profiles[0] to profile
    const templatesWithSortedComments = allTemplates.map(template => {
      if (template.comments && Array.isArray(template.comments) && template.comments.length > 0) {
        const sortedComments = [...template.comments].sort((a: any, b: any) => {
          const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
          if (likeDiff !== 0) return likeDiff
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
        // Transform profiles[0] to profile for comments and extract data values
        const commentsWithProfile = sortedComments.map((comment: any) => {
          const profileData = comment.user.profiles?.[0]?.data
          const profile = profileData ? {
            userName: profileData.username?.value || null,
            profilePicture: profileData.profilePicture?.value || null,
            firstName: profileData.firstName?.value || null,
            lastName: profileData.lastName?.value || null
          } : null
          
          return {
            ...comment,
            user: {
              ...comment.user,
              profile
            }
          }
        })
        return { ...template, comments: commentsWithProfile }
      }
      return template
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
      templatesWithSortedComments.map(async (template) => {
        // Get the first owner's profile (for now, we'll use the first owner)
        const users = (template.users as any[]) || []
        const owner = users.find((u: any) => u.role === 'OWNER')
        const ownerId = owner?.userId
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
            profiles: {
              select: {
                data: true
              }
            }
          }
        })

        // Filter out fields if not visible based on relationship
        let cleanedUser = null
        if (user) {
          const profile = user.profiles?.[0]
          if (!profile) {
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

            // Extract profile data from new structure and transform for filterProfileFields
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
              isOwner,
              isFriend,
              isCloseFriend
            })

            cleanedUser = {
              ...user,
              profile: filteredProfile
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

