/**
 * Task application status API Route Handler
 *
 * POST: Accept / shortlist / decline / withdraw an application
 * (owner/manager of the owning list only). Body: { status }.
 * ACCEPTED adds the applicant to Task.candidateIds and list membership.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { updateApplicationStatus } from '@/lib/services/applications'

/**
 * POST /api/v1/tasks/[taskId]/applications/[applicationId]
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string; applicationId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId, applicationId } = await params

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { status } = body as Record<string, unknown>
    if (typeof status !== 'string') {
      return NextResponse.json({ error: 'Status must be a string' }, { status: 400 })
    }

    const application = await updateApplicationStatus({
      viewerUserId: userId,
      taskId,
      applicationId,
      status
    })

    return NextResponse.json({ application })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in POST /api/v1/tasks/[taskId]/applications/[applicationId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
