import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser, getUserListRole } from '@/lib/services/auth'
import { updateTaskOccurrenceDates } from '@/lib/services/task'
import { updateDayProgress } from '@/lib/services/day'
import { calculateAndApplyJobEarnings, reverseJobEarnings, initializeJobInvoice, updateJobWithTaskValues } from '@/lib/services/job/earningsService'
import { validateStatusTransition, isAuthorizedForTransition } from '@/lib/services/job/statusValidator'
import { TASK_STATUS_MAP } from '@/lib/services/job/taskSync'
import { logJobStatusChange, logJobAcceptance, logAuthorizationFailure } from '@/lib/services/job/auditLogger'
import { formatDateLocal } from '@/lib/utils/taskUtils'
import { sanitizeText } from '@/lib/utils/sanitize'
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
      premium: true,
      premiumType: true,
      rrule: true
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

const MAX_TRANSACTION_RETRIES = 3
const TRANSACTION_RETRY_BASE_DELAY_MS = 200

interface JobUpdateTransactionParams {
  jobId: string
  existingJob: {
    taskId: string
    status: string
    occurrenceDate?: string | null
  }
  updateData: Record<string, unknown>
  newRequesterNoteId: string | null
  newReviewerNoteId: string | null
  newStatus?: string
}

/**
 * Run the job update transaction with retries for transient MongoDB write
 * conflicts/deadlocks (Prisma error code P2034). The callback only performs
 * writes, so it is safe to retry without duplicating data.
 */
async function updateJobWithRetry({
  jobId,
  existingJob,
  updateData,
  newRequesterNoteId,
  newReviewerNoteId,
  newStatus,
}: JobUpdateTransactionParams) {
  // Build note ID updates once outside the retry loop to avoid duplicate pushes
  // if a transaction attempt is retried.
  const jobUpdateData: Record<string, unknown> = { ...updateData }
  if (newRequesterNoteId) {
    jobUpdateData.requesterNoteIds = { push: newRequesterNoteId }
  }
  if (newReviewerNoteId) {
    jobUpdateData.reviewersNoteIds = { push: newReviewerNoteId }
  }

  // Statuses that can still be auto-rejected when another job wins the date.
  // A positive allow-list lets MongoDB use indexes (a $nin filter cannot).
  const AUTO_REJECTABLE_STATUSES = ['REQUESTED', 'SUBMITTED', 'VALIDATING', 'IN_PROGRESS', 'CANCELLED']

  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
    let taskUpdate: { id: string; status: string } | null = null
    try {
      await prisma.$transaction(async (tx) => {
        // Update job — no include here: relation reads inside the transaction
        // add many sequential roundtrips that can blow the interactive
        // transaction timeout (P2028 "Transaction already closed"). The full
        // job is re-fetched after commit instead.
        await tx.job.update({
          where: { id: jobId },
          data: jobUpdateData,
          select: { id: true, status: true }
        })

        // Sync task status based on job status
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

        // Auto-reject all competing jobs when one is accepted (for the same date)
        if (newStatus === 'ACCEPTED') {
          const rejectWhereClause: any = {
            taskId: existingJob.taskId,
            id: { not: jobId },
            status: { in: AUTO_REJECTABLE_STATUSES }
          }

          // If this job has an occurrenceDate, only reject competing jobs on the same date
          if (existingJob.occurrenceDate) {
            rejectWhereClause.occurrenceDate = existingJob.occurrenceDate
          }

          await tx.job.updateMany({
            where: rejectWhereClause,
            data: { status: 'REJECTED' }
          })
        }
      }, {
        // Defaults (maxWait 2s / timeout 5s) were exceeded under load by the
        // status sync + auto-reject writes, closing the transaction mid-flight.
        maxWait: 10_000,
        timeout: 20_000
      })

      // Re-fetch the job with its relations after the transaction commits —
      // the include does not need transactional consistency.
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: jobFullInclude
      })
      if (!job) {
        throw new Error('Job not found after update')
      }

      return { job, task: taskUpdate }
    } catch (error) {
      lastError = error
      const code = (error as { code?: string })?.code
      if (code !== 'P2034' || attempt === MAX_TRANSACTION_RETRIES) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, TRANSACTION_RETRY_BASE_DELAY_MS * attempt))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Job update transaction failed')
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
      justification,
      location,
      documentIds,
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

      // Prevent duplicate acceptance - check if another job is already accepted for this task on this date
      if (newStatus === 'ACCEPTED') {
        const whereClause: any = {
          taskId: existingJob.taskId,
          status: 'ACCEPTED',
          id: { not: jobId }
        }

        // If this job has an occurrenceDate, only check for duplicates on the same date
        if (existingJob.occurrenceDate) {
          whereClause.occurrenceDate = existingJob.occurrenceDate
        }

        const existingAccepted = await prisma.job.findFirst({
          where: whereClause
        })

        if (existingAccepted) {
          return NextResponse.json(
            { error: existingJob.occurrenceDate
              ? 'Task already has an accepted job for this date'
              : 'Task already has an accepted job'
            },
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

    // Justification for the job request (only the worker may set it)
    if (justification !== undefined) {
      if (!isWorker) {
        return NextResponse.json(
          { error: 'Unauthorized: Only the worker can update the justification' },
          { status: 403 }
        )
      }
      updateData.justification = justification ? sanitizeText(String(justification)) : null
    }

    // Evidence attachments (worker, owner, or manager)
    if (documentIds !== undefined) {
      if (!isWorker && !isOwnerOrManager) {
        return NextResponse.json(
          { error: 'Unauthorized: Only the worker, owners, and managers can attach evidence' },
          { status: 403 }
        )
      }
      if (!Array.isArray(documentIds) || !documentIds.every((v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v))) {
        return NextResponse.json(
          { error: 'documentIds must be an array of document IDs' },
          { status: 400 }
        )
      }
      updateData.documentIds = documentIds
    }

    // Geolocation (auto-extracted from evidence EXIF; worker/owner/manager)
    if (location !== undefined) {
      if (!isWorker && !isOwnerOrManager) {
        return NextResponse.json(
          { error: 'Unauthorized: Only the worker, owners, and managers can set the location' },
          { status: 403 }
        )
      }
      updateData.location = location && typeof location === 'object' ? location : null
    }

    // Create requester note if provided (worker's submission note)
    let newRequesterNoteId: string | null = null
    if (requesterNoteContent && requesterNoteContent.trim()) {
      // Type validation for note content
      if (typeof requesterNoteContent !== 'string') {
        return NextResponse.json(
          { error: 'Note content must be a string' },
          { status: 400 }
        )
      }
      if (requesterNoteContent.length > 50000) {
        return NextResponse.json(
          { error: 'Note content too long (max 50,000 characters)' },
          { status: 400 }
        )
      }
      // Sanitize note content to prevent XSS
      const sanitizedRequesterNote = sanitizeText(requesterNoteContent)
      const requesterNote = await prisma.note.create({
        data: {
          content: sanitizedRequesterNote,
          userId: existingJob.workerId,
          visibility: 'PRIVATE',
        }
      })
      newRequesterNoteId = requesterNote.id
    }

    // Create reviewer note if provided (reviewer's feedback note)
    let newReviewerNoteId: string | null = null
    if (reviewerNoteContent && reviewerNoteContent.trim()) {
      // Type validation for note content
      if (typeof reviewerNoteContent !== 'string') {
        return NextResponse.json(
          { error: 'Note content must be a string' },
          { status: 400 }
        )
      }
      if (reviewerNoteContent.length > 50000) {
        return NextResponse.json(
          { error: 'Note content too long (max 50,000 characters)' },
          { status: 400 }
        )
      }
      // Sanitize note content to prevent XSS
      const sanitizedReviewerNote = sanitizeText(reviewerNoteContent)
      const reviewerNote = await prisma.note.create({
        data: {
          content: sanitizedReviewerNote,
          userId: user!.id,
          visibility: 'PRIVATE',
        }
      })
      newReviewerNoteId = reviewerNote.id
    }

    // Update job with transaction for atomicity, retrying transient write conflicts
    const result = await updateJobWithRetry({
      jobId,
      existingJob,
      updateData,
      newRequesterNoteId,
      newReviewerNoteId,
      newStatus,
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

      // Initialize invoice when job transitions to IN_PROGRESS (job initiation)
      if (newStatus === 'IN_PROGRESS') {
        try {
          await initializeJobInvoice(jobId, existingJob.taskId, existingJob.listId)
        } catch (invoiceError) {
          console.error('Error initializing job invoice:', invoiceError)
          // Don't fail the entire request
        }
      }
    }

    // Update job with latest task values on every update
    try {
      await updateJobWithTaskValues(jobId, existingJob.taskId, existingJob.listId)
    } catch (taskValuesError) {
      console.error('Error updating job with task values:', taskValuesError)
      // Don't fail the entire request
    }

    // Handle accepted jobs - update occurrence dates and calculate earnings
    if (newStatus === 'ACCEPTED') {
      const dateToUse = existingJob.occurrenceDate || formatDateLocal(new Date())
      
      // Initialize invoice if not already set (for direct transitions to ACCEPTED)
      try {
        const jobForInvoice = await prisma.job.findUnique({
          where: { id: jobId },
          select: { invoice: true }
        })
        if (!jobForInvoice?.invoice) {
          await initializeJobInvoice(jobId, existingJob.taskId, existingJob.listId)
        }
      } catch (invoiceError) {
        console.error('Error initializing job invoice for accepted job:', invoiceError)
      }
      
      await updateTaskOccurrenceDates(existingJob.taskId, 'complete', dateToUse)
      await updateDayProgress(existingJob.workerId, dateToUse)

      try {
        await calculateAndApplyJobEarnings({
          jobId: existingJob.id,
          taskId: existingJob.taskId,
          listId: existingJob.listId,
          workerId: existingJob.workerId,
          occurrenceDate: dateToUse
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
    if (wasAccepted && !isNowAccepted) {
      const dateToUse = existingJob.occurrenceDate || formatDateLocal(new Date())
      await updateTaskOccurrenceDates(existingJob.taskId, 'delete', dateToUse)
      await updateDayProgress(existingJob.workerId, dateToUse)

      try {
        await reverseJobEarnings({
          jobId: existingJob.id,
          workerId: existingJob.workerId,
          occurrenceDate: dateToUse
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
        { error: 'Unauthorized: Only list owners and managers can cancel jobs' },
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
          occurrenceDate
        })
      } catch (earningsError) {
        console.error('Error reversing job earnings:', earningsError)
        // Don't fail the job cancellation if earnings reversal fails
      }
    }

    // For compliance: Update job status to CANCELLED instead of deleting
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' }
    })

    // Update task occurrence dates if job was ACCEPTED
    // Note: For non-recurring tasks, this will reset the task status to OPEN,
    // allowing the task to be re-opened from any date
    if (status === 'ACCEPTED' && occurrenceDate) {
      await updateTaskOccurrenceDates(taskId, 'delete', occurrenceDate)

      // Update Day.progress for this date
      await updateDayProgress(workerId, occurrenceDate)
    }

    return NextResponse.json({ message: 'Job cancelled successfully' })
  } catch (error) {
    console.error('Error cancelling job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
