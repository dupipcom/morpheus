/**
 * Public events discovery API Route Handler (Phase 8)
 *
 * GET: PUBLISHED + PUBLIC events only. Filters: from/to/q/near/category/
 * project/cursor/limit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listPublicEvents } from '@/lib/services/events'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const result = await listPublicEvents({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      q: searchParams.get('q'),
      near: searchParams.get('near'),
      category: searchParams.get('category'),
      project: searchParams.get('project'),
      cursor: searchParams.get('cursor'),
      limit: parseInt(searchParams.get('limit') || '20', 10)
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ApiError) return toResponse(error)
    console.error('Error in GET /api/v1/events/public:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
