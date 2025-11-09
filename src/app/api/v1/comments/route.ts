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
    let whereClause: any = {
      entityType,
      entityId
    }
    
    // Fetch comments for the entity, ordered by creation date (newest first)
    const comments = await prisma.comment.findMany({
      where: whereClause,
      include: {
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ comments })
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

    // Build comment data
    const commentData: any = {
      content: content.trim(),
      entityType,
      entityId,
      userId: user.id
    }

    // Set the appropriate relation field for backward compatibility
    if (entityType === 'note') {
      commentData.noteId = entityId
    } else if (entityType === 'template') {
      commentData.templateId = entityId
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: commentData,
      include: {
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

    return NextResponse.json({ comment })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

