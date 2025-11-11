import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

// GET /api/v1/comments?entityType=note&entityId=xxx
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const entityType = searchParams.get('entityType')
    const entityId = searchParams.get('entityId')
    
    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 })
    }
    
    // Build where clause based on entity type
    let whereClause: any = {}
    
    if (entityType === 'note') {
      whereClause.noteId = entityId
    } else if (entityType === 'template') {
      whereClause.templateId = entityId
    } else if (entityType === 'tasklist' || entityType === 'list') {
      whereClause.listId = entityId
    } else if (entityType === 'profile') {
      whereClause.profileId = entityId
    } else if (entityType === 'event') {
      whereClause.eventId = entityId
    } else {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 })
    }
    
    // Fetch comments for the entity with like counts
    const comments = await prisma.comment.findMany({
      where: whereClause,
      include: {
        user: {
          include: {
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
    })

    // Sort by like count (descending), then by creation date (descending)
    // Transform profiles[0] to profile and extract data values
    const sortedComments = comments.map((comment: any) => {
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
    }).sort((a, b) => {
      const likeDiff = (b._count?.likes || 0) - (a._count?.likes || 0)
      if (likeDiff !== 0) return likeDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return NextResponse.json({ comments: sortedComments })
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/v1/comments
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { content, entityType, entityId } = body

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 })
    }

    // Verify entity exists based on type
    let entityExists = false
    if (entityType === 'note') {
      const note = await prisma.note.findUnique({
        where: { id: entityId }
      })
      entityExists = !!note
    } else if (entityType === 'template') {
      const template = await prisma.template.findUnique({
        where: { id: entityId }
      })
      entityExists = !!template
    } else if (entityType === 'tasklist' || entityType === 'list') {
      const taskList = await prisma.list.findUnique({
        where: { id: entityId }
      })
      entityExists = !!taskList
    } else if (entityType === 'profile') {
      const profile = await prisma.profile.findUnique({
        where: { id: entityId }
      })
      entityExists = !!profile
    } else if (entityType === 'event') {
      const event = await prisma.event.findUnique({
        where: { id: entityId }
      })
      entityExists = !!event
    } else {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 })
    }

    if (!entityExists) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build comment data based on entity type
    const commentData: any = {
      content: content.trim(),
      userId: user.id
    }

    // Set the appropriate relation field based on entity type
    if (entityType === 'note') {
      commentData.noteId = entityId
    } else if (entityType === 'template') {
      commentData.templateId = entityId
    } else if (entityType === 'tasklist' || entityType === 'list') {
      commentData.listId = entityId
    } else if (entityType === 'profile') {
      commentData.profileId = entityId
    } else if (entityType === 'event') {
      commentData.eventId = entityId
    } else {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 })
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: commentData,
      include: {
        user: {
          include: {
              profiles: {
                select: {
                  data: true
                }
              }
          }
        }
      }
    })

    // Transform profiles[0] to profile and extract data values
    const profileData = comment.user.profiles?.[0]?.data
    const profile = profileData ? {
      userName: profileData.username?.value || null,
      profilePicture: profileData.profilePicture?.value || null,
      firstName: profileData.firstName?.value || null,
      lastName: profileData.lastName?.value || null
    } : null

    const transformedComment = {
      ...comment,
      user: {
        ...comment.user,
        profile
      }
    }

    return NextResponse.json({ comment: transformedComment })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

