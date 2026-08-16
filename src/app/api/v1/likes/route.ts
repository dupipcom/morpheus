import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { toggleLike, getLikeState } from '@/lib/services/social'

// POST /api/v1/likes - Toggle like (like if not liked, unlike if already liked)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { entityType, entityId } = body

    const result = await toggleLike(userId, entityType, entityId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error toggling like:', error)
    if (error instanceof ApiError) {
      return toResponse(error)
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

    const result = await getLikeState(userId, entityType, entityId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching likes:', error)
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
