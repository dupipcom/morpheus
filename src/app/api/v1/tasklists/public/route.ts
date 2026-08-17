/**
 * Public tasklists API Route Handler
 *
 * GET: Job-board discovery feed across every published list (publicVisible +
 * visibility PUBLIC only). Cursor pagination; q/area/category filters.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listPublicTaskLists } from '@/lib/services/list'

/**
 * GET /api/v1/tasklists/public
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor')
    const q = searchParams.get('q')
    const area = searchParams.get('area')
    const category = searchParams.get('category')
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const { taskLists, nextCursor } = await listPublicTaskLists({
      cursor,
      q,
      area,
      category,
      limit: Number.isNaN(limit) ? 20 : limit
    })

    return NextResponse.json({ taskLists, nextCursor })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/tasklists/public:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
