import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listComments, createComment } from '@/lib/services/social'

// GET /api/v1/comments?entityType=note&entityId=xxx
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const entityType = searchParams.get('entityType')
    const entityId = searchParams.get('entityId')

    const comments = await listComments(entityType, entityId)

    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Error fetching comments:', error)
    if (error instanceof ApiError) {
      return toResponse(error)
    }
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

    const comment = await createComment(userId, content, entityType, entityId)

    return NextResponse.json({ comment })
  } catch (error) {
    console.error('Error creating comment:', error)
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
