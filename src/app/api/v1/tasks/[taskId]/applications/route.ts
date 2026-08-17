/**
 * Task applications API Route Handler
 *
 * GET: List applications for a task (owner/manager of the owning list only).
 * Applicant profiles are batch-enriched.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ApiError, toResponse } from '@/lib/services/errors'
import { listApplications } from '@/lib/services/applications'

/**
 * GET /api/v1/tasks/[taskId]/applications
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
): Promise<NextResponse> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    const applications = await listApplications({ viewerUserId: userId, taskId })

    return NextResponse.json({ applications })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error in GET /api/v1/tasks/[taskId]/applications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
