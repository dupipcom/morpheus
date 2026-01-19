import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import {
  buildVisibilityWhereClauseForUserArray,
  getCurrentUser,
  batchEnrichUserProfiles,
  extractProfileData,
  getOwnerId
} from '@/lib/services/visibility'
import { filterProfileFields } from '@/lib/utils/profileUtils'

/**
 * Template select configuration for queries
 */
const templateSelect = {
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
      createdAt: 'desc' as const
    }
  }
}

/**
 * Sort comments by likes then by date
 */
function sortAndTransformComments(comments: any[]): any[] {
  if (!comments?.length) return []

  return [...comments]
    .sort((a, b) => {
      const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
      if (likeDiff !== 0) return likeDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .map((comment) => {
      const profileData = comment.user.profiles?.[0]?.data
      const profile = profileData
        ? {
            userName: profileData.username?.value || null,
            profilePicture: profileData.profilePicture?.value || null,
            firstName: profileData.firstName?.value || null,
            lastName: profileData.lastName?.value || null
          }
        : null

      return {
        ...comment,
        user: {
          ...comment.user,
          profile
        }
      }
    })
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const skip = (page - 1) * limit
    const filterTemplateId = searchParams.get('templateId') || searchParams.get('listId')
    const filterProfileId = searchParams.get('profileId')

    const { userId } = await auth()

    // Build visibility-aware where clause using shared service
    const whereClause = await buildVisibilityWhereClauseForUserArray(userId || null)

    // Handle empty OR conditions
    const finalWhereClause = whereClause.OR.length === 0
      ? { visibility: 'PUBLIC' }
      : whereClause

    // Fetch matching templates first if filter is provided
    let matchingTemplates: any[] = []
    let matchingTemplateIds: string[] = []

    if (filterTemplateId || filterProfileId) {
      const matchingWhereClause: any = { ...finalWhereClause }

      if (filterTemplateId) {
        matchingWhereClause.id = filterTemplateId
      }

      if (filterProfileId) {
        const profileUser = await prisma.user.findFirst({
          where: {
            OR: [{ id: filterProfileId }, { userId: filterProfileId }]
          },
          select: { id: true }
        })
        if (profileUser) {
          matchingWhereClause.users = {
            some: { userId: profileUser.id, role: 'OWNER' }
          }
        }
      }

      const matching = await prisma.template.findMany({
        where: matchingWhereClause,
        orderBy: { createdAt: 'desc' },
        select: templateSelect
      })

      matchingTemplates = matching
      matchingTemplateIds = matching.map(t => t.id.toString())
    }

    // Fetch regular templates, excluding matching ones
    const regularWhereClause = matchingTemplateIds.length > 0
      ? { ...finalWhereClause, id: { notIn: matchingTemplateIds } }
      : finalWhereClause

    const regularLimit = matchingTemplateIds.length > 0
      ? limit - matchingTemplates.length
      : limit

    const templates = await prisma.template.findMany({
      where: regularWhereClause,
      orderBy: { createdAt: 'desc' },
      take: Math.max(0, regularLimit),
      skip: Math.max(0, skip),
      select: templateSelect
    })

    // Combine matching templates first, then regular templates
    const allTemplates = [...matchingTemplates, ...templates]

    // Sort comments
    const templatesWithSortedComments = allTemplates.map(template => ({
      ...template,
      comments: sortAndTransformComments(template.comments)
    }))

    // Get current user for relationship checking
    const currentUser = await getCurrentUser(userId || null)

    // Collect all owner IDs for batch profile fetching (fixes N+1)
    const ownerIds = templatesWithSortedComments
      .map(template => {
        const users = (template.users as any[]) || []
        const owner = users.find((u: any) => u.role === 'OWNER')
        return owner?.userId
      })
      .filter((id): id is string => !!id)

    // Batch fetch all user profiles
    const profilesMap = await batchEnrichUserProfiles(ownerIds, currentUser)

    // Enrich templates with user profiles
    const templatesWithUsers = templatesWithSortedComments.map(template => {
      const users = (template.users as any[]) || []
      const owner = users.find((u: any) => u.role === 'OWNER')
      const ownerId = owner?.userId

      if (!ownerId) {
        return { ...template, user: null }
      }

      const userProfile = profilesMap.get(ownerId)
      return {
        ...template,
        user: userProfile || null
      }
    })

    // Get total count for pagination
    const totalCount = await prisma.template.count({
      where: finalWhereClause
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
