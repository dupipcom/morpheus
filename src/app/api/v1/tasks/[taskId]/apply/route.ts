/**
 * Task apply API Route Handler
 *
 * POST: Apply to a public job post. Body: { message?, documentIds? }.
 * 404 unpublished/non-public task, 400 applications closed / position filled,
 * 409 duplicate application.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { applyToTask } from '@/lib/services/applications'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/**
 * POST /api/v1/tasks/[taskId]/apply
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { message, documentIds } = body as Record<string, unknown>

    if (message !== undefined && typeof message !== 'string') {
      return NextResponse.json({ error: 'Message must be a string' }, { status: 400 })
    }

    if (
      documentIds !== undefined &&
      (!Array.isArray(documentIds) || !documentIds.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v)))
    ) {
      return NextResponse.json({ error: 'documentIds must be an array of document IDs' }, { status: 400 })
    }

    const application = await applyToTask({
      viewerUserId: userId,
      taskId,
      message: typeof message === 'string' ? message : null,
      documentIds: Array.isArray(documentIds) ? (documentIds as string[]) : undefined
    })

    return NextResponse.json({ application })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in POST /api/v1/tasks/[taskId]/apply:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
