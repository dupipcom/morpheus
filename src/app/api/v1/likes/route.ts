import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

// POST /api/v1/likes - Toggle like (like if not liked, unlike if already liked)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { entityType, entityId } = body

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
    } else if (entityType === 'comment') {
      const comment = await prisma.comment.findUnique({
        where: { id: entityId }
      })
      entityExists = !!comment
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

    // Check if like already exists
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_entityType_entityId: {
          userId: user.id,
          entityType,
          entityId
        }
      }
    })

    if (existingLike) {
      // Unlike - delete the like
      await prisma.like.delete({
        where: { id: existingLike.id }
      })

      // Get updated like count
      const likeCount = await prisma.like.count({
        where: {
          entityType,
          entityId
        }
      })

      return NextResponse.json({ 
        liked: false,
        likeCount 
      })
    } else {
      // Like - create the like
      const likeData: any = {
        entityType,
        entityId,
        userId: user.id
      }

      // Set the appropriate relation field for backward compatibility
      if (entityType === 'note') {
        likeData.noteId = entityId
      } else if (entityType === 'template') {
        likeData.templateId = entityId
      } else if (entityType === 'comment') {
        likeData.commentId = entityId
      }

      await prisma.like.create({
        data: likeData
      })

      // Get updated like count
      const likeCount = await prisma.like.count({
        where: {
          entityType,
          entityId
        }
      })

      return NextResponse.json({ 
        liked: true,
        likeCount 
      })
    }
  } catch (error: any) {
    console.error('Error toggling like:', error)
    // Handle unique constraint violation (already liked)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Already liked' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/v1/likes?entityType=note&entityId=xxx - Get like status and count
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    const searchParams = request.nextUrl.searchParams
    const entityType = searchParams.get('entityType')
    const entityId = searchParams.get('entityId')
    
    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 })
    }

    // Get like count
    const likeCount = await prisma.like.count({
      where: {
        entityType,
        entityId
      }
    })

    // Check if current user has liked this entity
    let isLiked = false
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { userId }
      })

      if (user) {
        const existingLike = await prisma.like.findUnique({
          where: {
            userId_entityType_entityId: {
              userId: user.id,
              entityType,
              entityId
            }
          }
        })
        isLiked = !!existingLike
      }
    }

    return NextResponse.json({ 
      isLiked,
      likeCount 
    })
  } catch (error) {
    console.error('Error fetching likes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

