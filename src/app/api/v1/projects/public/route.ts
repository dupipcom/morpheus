/**
 * Public projects API Route Handler
 *
 * GET: Project discovery feed (spotlight first, then recently updated).
 * Cursor pagination; q filter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listPublicProjects } from '@/lib/services/projects'

/**
 * GET /api/v1/projects/public
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor')
    const q = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const { projects, nextCursor } = await listPublicProjects({
      cursor,
      q,
      limit: Number.isNaN(limit) ? 20 : limit
    })

    return NextResponse.json({ projects, nextCursor })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/projects/public:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
