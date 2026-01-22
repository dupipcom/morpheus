import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser, getUserListRole } from '@/lib/services/auth'
import { updateTaskOccurrenceDates } from '@/lib/services/task'
import { updateDayProgress } from '@/lib/services/day'
import { calculateAndApplyJobEarnings, reverseJobEarnings } from '@/lib/services/job/earningsService'
import { validateStatusTransition, isAuthorizedForTransition } from '@/lib/services/job/statusValidator'
import { TASK_STATUS_MAP } from '@/lib/services/job/taskSync'
import { logJobStatusChange, logJobAcceptance, logAuthorizationFailure } from '@/lib/services/job/auditLogger'
import type { ListUser, UpdateJobRequest } from '@/lib/services/job/types'

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
  requesterNotes: {
    include: {
      user: { select: { id: true, profiles: true } }
    }
  },
  reviewersNotes: {
    include: {
      user: { select: { id: true, profiles: true } }
    }
  }
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
    const body: UpdateJobRequest = await request.json()
    const {
      status: newStatus,
      requesterNoteContent,
      reviewerNoteContent,
      selfReview,
      managerReview,
    } = body

    // Fetch existing job with relations
    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        task: { select: { id: true, status: true, listId: true } },
        list: { select: { id: true, users: true } },
        worker: { select: { id: true } },
        requesterNotes: true,
        reviewersNotes: true,
      }
    })

    if (!existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!existingJob.listId || !existingJob.list) {
      return NextResponse.json({ error: 'Job has no associated list' }, { status: 400 })
    }

    // Determine user's role and permissions
    const userRole = existingJob.list.users.find((u: ListUser) => u.userId === user!.id)?.role
    const isWorker = existingJob.workerId === user!.id
    const isReviewer = existingJob.reviewerIds?.includes(user!.id) || false
    const isOwnerOrManager = userRole && ['OWNER', 'MANAGER'].includes(userRole)
    const isListMember = !!userRole

    if (!isListMember) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of the list to update this job' },
        { status: 403 }
      )
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {}

    // Validate and authorize status transition
    if (newStatus && newStatus !== existingJob.status) {
      // Validate the transition is allowed
      const transitionResult = validateStatusTransition(existingJob.status, newStatus)
      if (!transitionResult.valid) {
        return NextResponse.json(
          { error: transitionResult.error },
          { status: 400 }
        )
      }

      // Check authorization for this transition
      const authResult = isAuthorizedForTransition(existingJob.status, newStatus, {
        userRole,
        isWorker,
        isReviewer,
      })

      // Special case: Workers cannot accept/reject their own jobs
      if ((newStatus === 'ACCEPTED' || newStatus === 'REJECTED') && isWorker && !isOwnerOrManager) {
        await logAuthorizationFailure({
          userId: user!.id,
          action: 'job.status.update',
          resourceType: 'Job',
          resourceId: jobId,
          reason: 'Workers cannot validate their own jobs',
        })
        return NextResponse.json(
          { error: 'Unauthorized: Workers cannot validate their own jobs' },
          { status: 403 }
        )
      }

      if (!authResult.authorized) {
        await logAuthorizationFailure({
          userId: user!.id,
          action: 'job.status.update',
          resourceType: 'Job',
          resourceId: jobId,
          reason: authResult.error || `Unauthorized transition from ${existingJob.status} to ${newStatus}`,
        })
        return NextResponse.json(
          { error: authResult.error || 'You are not authorized to perform this transition' },
          { status: 403 }
        )
      }

      // Prevent duplicate acceptance - check if another job is already accepted
      if (newStatus === 'ACCEPTED') {
        const existingAccepted = await prisma.job.findFirst({
          where: {
            taskId: existingJob.taskId,
            status: 'ACCEPTED',
            id: { not: jobId }
          }
        })
        if (existingAccepted) {
          return NextResponse.json(
            { error: 'Task already has an accepted job' },
            { status: 400 }
          )
        }
      }

      updateData.status = newStatus
    }

    // Authorization checks for review fields
    if (selfReview !== undefined) {
      if (!isWorker) {
        return NextResponse.json(
          { error: 'Unauthorized: Only the worker can update their own self-review' },
          { status: 403 }
        )
      }
      if (selfReview < 0 || selfReview > 100) {
        return NextResponse.json(
          { error: 'Self-review must be between 0 and 100' },
          { status: 400 }
        )
      }
      updateData.selfReview = selfReview
    }

    if (managerReview !== undefined) {
      if (!isOwnerOrManager) {
        return NextResponse.json(
          { error: 'Unauthorized: Only owners and managers can update manager reviews' },
          { status: 403 }
        )
      }
      if (managerReview < 0 || managerReview > 100) {
        return NextResponse.json(
          { error: 'Manager review must be between 0 and 100' },
          { status: 400 }
        )
      }
      updateData.managerReview = managerReview
    }

    // Create requester note if provided (worker's submission note)
    let newRequesterNoteId: string | null = null
    if (requesterNoteContent && requesterNoteContent.trim()) {
      if (requesterNoteContent.length > 50000) {
        return NextResponse.json(
          { error: 'Note content too long (max 50,000 characters)' },
          { status: 400 }
        )
      }
      const requesterNote = await prisma.note.create({
        data: {
          content: requesterNoteContent,
          userId: existingJob.workerId,
          visibility: 'PRIVATE',
        }
      })
      newRequesterNoteId = requesterNote.id
    }

    // Create reviewer note if provided (reviewer's feedback note)
    let newReviewerNoteId: string | null = null
    if (reviewerNoteContent && reviewerNoteContent.trim()) {
      if (reviewerNoteContent.length > 50000) {
        return NextResponse.json(
          { error: 'Note content too long (max 50,000 characters)' },
          { status: 400 }
        )
      }
      const reviewerNote = await prisma.note.create({
        data: {
          content: reviewerNoteContent,
          userId: user!.id,
          visibility: 'PRIVATE',
        }
      })
      newReviewerNoteId = reviewerNote.id
    }

    // Update job with transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Build note ID updates
      if (newRequesterNoteId) {
        updateData.requesterNoteIds = {
          push: newRequesterNoteId
        }
      }
      if (newReviewerNoteId) {
        updateData.reviewersNoteIds = {
          push: newReviewerNoteId
        }
      }

      // Update job
      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: updateData,
        include: {
          ...jobFullInclude,
          requesterNotes: true,
          reviewersNotes: {
            include: {
              user: { select: { id: true, profiles: true } }
            }
          },
        }
      })

      // Sync task status based on job status
      let taskUpdate: { id: string; status: string } | null = null
      if (newStatus && newStatus !== existingJob.status) {
        const newTaskStatus = TASK_STATUS_MAP[newStatus]
        if (newTaskStatus) {
          taskUpdate = await tx.task.update({
            where: { id: existingJob.taskId },
            data: { status: newTaskStatus as 'OPEN' | 'IN_PROGRESS' | 'READY' | 'DONE' },
            select: { id: true, status: true }
          })
        }
      }

      // Auto-reject all competing jobs when one is accepted
      if (newStatus === 'ACCEPTED') {
        await tx.job.updateMany({
          where: {
            taskId: existingJob.taskId,
            id: { not: jobId },
            status: { notIn: ['ACCEPTED', 'REJECTED'] }
          },
          data: { status: 'REJECTED' }
        })
      }

      return { job: updatedJob, task: taskUpdate }
    })

    // Audit log status change
    if (newStatus && newStatus !== existingJob.status) {
      await logJobStatusChange({
        userId: user!.id,
        jobId: jobId,
        oldStatus: existingJob.status,
        newStatus: newStatus,
        taskId: existingJob.taskId,
        listId: existingJob.listId,
      })
    }

    // Handle accepted jobs - update occurrence dates and calculate earnings
    if (newStatus === 'ACCEPTED' && existingJob.occurrenceDate) {
      await updateTaskOccurrenceDates(existingJob.taskId, 'complete', existingJob.occurrenceDate)
      await updateDayProgress(existingJob.workerId, existingJob.occurrenceDate)

      try {
        await calculateAndApplyJobEarnings({
          jobId: existingJob.id,
          taskId: existingJob.taskId,
          listId: existingJob.listId,
          workerId: existingJob.workerId,
          occurrenceDate: existingJob.occurrenceDate
        })

        // Audit log job acceptance (financial event)
        await logJobAcceptance({
          userId: user!.id,
          jobId: jobId,
          workerId: existingJob.workerId,
          taskId: existingJob.taskId,
          listId: existingJob.listId,
          managerReview: managerReview,
        })
      } catch (earningsError) {
        console.error('Error calculating job earnings:', earningsError)
        // Don't fail the entire request
      }
    }

    // Handle unaccepted jobs (status changed from ACCEPTED to something else)
    const wasAccepted = existingJob.status === 'ACCEPTED'
    const isNowAccepted = result.job.status === 'ACCEPTED'
    if (wasAccepted && !isNowAccepted && existingJob.occurrenceDate) {
      await updateTaskOccurrenceDates(existingJob.taskId, 'delete', existingJob.occurrenceDate)
      await updateDayProgress(existingJob.workerId, existingJob.occurrenceDate)

      try {
        await reverseJobEarnings({
          jobId: existingJob.id,
          workerId: existingJob.workerId,
          occurrenceDate: existingJob.occurrenceDate
        })
      } catch (earningsError) {
        console.error('Error reversing job earnings:', earningsError)
      }
    }

    return NextResponse.json({
      job: result.job,
      task: result.task,
    })
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
