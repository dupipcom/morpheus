import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser, getUserListRole } from '@/lib/services/auth'
import { updateTaskOccurrenceDates } from '@/lib/services/task'
import { updateDayProgress } from '@/lib/services/day'
import { calculateAndApplyJobEarnings, reverseJobEarnings } from '@/lib/services/job/earningsService'

/**
 * Shared include configuration for job queries with full relations
 */
const jobFullInclude = {
  task: {
    select: {
      id: true,
      name: true,
      area: true,
      categories: true,
      status: true,
      budget: true
    }
  },
  list: {
    select: {
      id: true,
      name: true,
      users: true
    }
  },
  worker: {
    select: {
      id: true,
      userId: true,
      profiles: {
        select: {
          username: true,
          data: true
        }
      }
    }
  },
  reviewers: {
    select: {
      id: true,
      userId: true,
      profiles: {
        select: {
          username: true,
          data: true
        }
      }
    }
  },
  reviewersNotes: true
}

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    const { jobId } = await params

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: jobFullInclude
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!job.list) {
      return NextResponse.json({ error: 'Job has no associated list' }, { status: 400 })
    }

    const isMember = job.list.users.some(
      (userRef: { userId: string; role: string }) =>
        userRef.userId === user!.id &&
        ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER'].includes(userRef.role)
    )

    if (!isMember) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of the list to view this job' },
        { status: 403 }
      )
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error fetching job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    const { jobId } = await params
    const body = await request.json()

    // Fetch existing job
    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        list: {
          select: {
            id: true,
            users: true
          }
        },
        worker: {
          select: {
            id: true
          }
        }
      }
    })

    if (!existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!existingJob.listId) {
      return NextResponse.json({ error: 'Job has no associated list' }, { status: 400 })
    }

    const role = await getUserListRole(user!.id, existingJob.listId)

    if (!role || !['OWNER', 'MANAGER', 'COLLABORATOR'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of the list to update this job' },
        { status: 403 }
      )
    }

    const isOwnerOrManager = ['OWNER', 'MANAGER'].includes(role)
    const isWorker = existingJob.workerId === user!.id

    // Prepare update data
    const updateData: any = {}

    // Authorization checks for different fields
    if (body.selfReview !== undefined) {
      if (!isWorker) {
        return NextResponse.json(
          { error: 'Unauthorized: Only the worker can update their own self-review' },
          { status: 403 }
        )
      }
      updateData.selfReview = body.selfReview
    }

    if (body.peerReview !== undefined || body.managerReview !== undefined) {
      if (!isOwnerOrManager) {
        return NextResponse.json(
          { error: 'Unauthorized: Only owners and managers can update peer/manager reviews' },
          { status: 403 }
        )
      }
      if (body.peerReview !== undefined) updateData.peerReview = body.peerReview
      if (body.managerReview !== undefined) updateData.managerReview = body.managerReview
    }

    if (body.status !== undefined) {
      const newStatus = body.status

      // Status changes to ACCEPTED/REJECTED require owner/manager AND cannot be the worker
      if (newStatus === 'ACCEPTED' || newStatus === 'REJECTED') {
        if (!isOwnerOrManager) {
          return NextResponse.json(
            { error: 'Unauthorized: Only owners and managers can accept or reject jobs' },
            { status: 403 }
          )
        }
        if (isWorker) {
          return NextResponse.json(
            { error: 'Unauthorized: Workers cannot validate their own jobs' },
            { status: 403 }
          )
        }
      }

      // Status changes to IN_PROGRESS/VALIDATING can be done by the worker
      if (newStatus === 'IN_PROGRESS' || newStatus === 'VALIDATING') {
        if (!isWorker && !isOwnerOrManager) {
          return NextResponse.json(
            {
              error:
                'Unauthorized: Only the worker or managers can update status to IN_PROGRESS/VALIDATING'
            },
            { status: 403 }
          )
        }
      }

      updateData.status = newStatus
    }

    if (body.reviewerIds !== undefined) {
      if (!isOwnerOrManager) {
        return NextResponse.json(
          { error: 'Unauthorized: Only owners and managers can assign reviewers' },
          { status: 403 }
        )
      }
      updateData.reviewerIds = body.reviewerIds
    }

    if (body.reviewersNoteIds !== undefined) {
      if (!isOwnerOrManager) {
        return NextResponse.json(
          { error: 'Unauthorized: Only owners and managers can manage reviewer notes' },
          { status: 403 }
        )
      }
      updateData.reviewersNoteIds = body.reviewersNoteIds
    }

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
      include: jobFullInclude
    })

    // Update task occurrence dates if status changed to/from ACCEPTED
    if (body.status !== undefined && existingJob.occurrenceDate) {
      const wasAccepted = existingJob.status === 'ACCEPTED'
      const isNowAccepted = updatedJob.status === 'ACCEPTED'

      if (!wasAccepted && isNowAccepted) {
        // Job was just accepted - count as completion
        await updateTaskOccurrenceDates(existingJob.taskId, 'complete', existingJob.occurrenceDate)

        // Update Day.progress for this date
        await updateDayProgress(existingJob.workerId, existingJob.occurrenceDate)

        // Calculate and apply financial earnings
        try {
          await calculateAndApplyJobEarnings({
            jobId: existingJob.id,
            taskId: existingJob.taskId,
            listId: existingJob.listId,
            workerId: existingJob.workerId,
            occurrenceDate: existingJob.occurrenceDate
          })
        } catch (earningsError) {
          console.error('Error calculating job earnings:', earningsError)
          // Don't fail the job update if earnings calculation fails
        }
      } else if (wasAccepted && !isNowAccepted) {
        // Job was unaccepted - remove from completion count
        await updateTaskOccurrenceDates(existingJob.taskId, 'delete', existingJob.occurrenceDate)

        // Update Day.progress for this date
        await updateDayProgress(existingJob.workerId, existingJob.occurrenceDate)

        // Reverse financial earnings
        try {
          await reverseJobEarnings({
            jobId: existingJob.id,
            workerId: existingJob.workerId,
            occurrenceDate: existingJob.occurrenceDate
          })
        } catch (earningsError) {
          console.error('Error reversing job earnings:', earningsError)
          // Don't fail the job update if earnings reversal fails
        }
      }
    }

    return NextResponse.json({ job: updatedJob })
  } catch (error) {
    console.error('Error updating job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    const { jobId } = await params

    // Fetch existing job
    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        list: {
          select: {
            id: true,
            users: true
          }
        }
      }
    })

    if (!existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!existingJob.listId) {
      return NextResponse.json({ error: 'Job has no associated list' }, { status: 400 })
    }

    const role = await getUserListRole(user!.id, existingJob.listId)

    if (!role || !['OWNER', 'MANAGER'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can delete jobs' },
        { status: 403 }
      )
    }

    // Save job info for occurrence date update
    const { taskId, occurrenceDate, status, workerId } = existingJob

    // Reverse financial earnings if job was ACCEPTED
    if (status === 'ACCEPTED' && occurrenceDate) {
      try {
        await reverseJobEarnings({
          jobId: existingJob.id,
          workerId: existingJob.workerId,
          occurrenceDate: existingJob.occurrenceDate
        })
      } catch (earningsError) {
        console.error('Error reversing job earnings:', earningsError)
        // Don't fail the job deletion if earnings reversal fails
      }
    }

    // Delete job
    await prisma.job.delete({
      where: { id: jobId }
    })

    // Update task occurrence dates if job was ACCEPTED
    if (status === 'ACCEPTED' && occurrenceDate) {
      await updateTaskOccurrenceDates(taskId, 'delete', occurrenceDate)

      // Update Day.progress for this date
      await updateDayProgress(workerId, occurrenceDate)
    }

    return NextResponse.json({ message: 'Job deleted successfully' })
  } catch (error) {
    console.error('Error deleting job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
