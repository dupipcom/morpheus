import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getUserListRole } from '@/lib/services/auth'
import { updateTaskOccurrenceDates } from '@/lib/services/task'
import { updateDayProgress } from '@/lib/services/day'
import { formatDateLocal } from '@/lib/utils/taskUtils'
import { sanitizeText } from '@/lib/utils/sanitize'
import { calculateAndApplyJobEarnings, initializeJobInvoice, updateJobWithTaskValues } from '@/lib/services/job/earningsService'
import type { ListUser } from '@/lib/services/job/types'

// Standard job include clause for consistent responses
const JOB_INCLUDE = {
  task: true,
  list: {
    select: {
      id: true,
      name: true,
      users: true,
      visibility: true,
      role: true,
    }
  },
  worker: { select: { id: true, userId: true, profiles: { select: { username: true, data: true } } } },
  reviewers: { select: { id: true, userId: true, profiles: { select: { username: true, data: true } } } },
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
} as const

// Valid roles for job creation and viewing
const JOB_CREATION_ROLES = ['OWNER', 'MANAGER', 'COLLABORATOR']
const JOB_VIEW_ROLES = ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER']

// Build where clause from search params
function buildJobWhereClause(searchParams: URLSearchParams): Record<string, any> {
  const where: Record<string, any> = {}
  
  // Simple field mappings
  const paramMap = [
    ['listId', 'listId'],
    ['taskId', 'taskId'],
    ['workerId', 'workerId'],
    ['status', 'status']
  ]
  paramMap.forEach(([param, field]) => {
    const value = searchParams.get(param)
    if (value) where[field] = value
  })
  
  // Handle date filtering - date range takes precedence over single date
  const dateStart = searchParams.get('dateStart')
  const dateEnd = searchParams.get('dateEnd')
  const singleDate = searchParams.get('date')
  
  if (dateStart && dateEnd) {
    // Date range filter for weekly lists
    where.occurrenceDate = {
      gte: dateStart,
      lte: dateEnd
    }
  } else if (singleDate) {
    // Exact date match for daily lists
    where.occurrenceDate = singleDate
  }
  // No date filter for one-off lists (neither date nor dateStart/dateEnd provided)
  
  return where
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const whereClause = buildJobWhereClause(searchParams)

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: JOB_INCLUDE,
      orderBy: { createdAt: 'desc' }
    })

    // Filter and format based on access level (privacy filtering)
    const processedJobs = jobs
      .map((job: typeof jobs[0]) => {
        // Check if user is a list member by checking if their MongoDB ObjectId is in list.users
        const listUsers = job.list?.users || []
        const userListRef = listUsers.find((ref: ListUser) => ref.userId === user.id)

        if (!userListRef || !JOB_VIEW_ROLES.includes(userListRef.role)) {
          // No access if not a list member with proper role
          return null
        }

        // Check if user is a participant (worker, owner, manager, or reviewer)
        const isWorker = job.workerId === user.id
        const isOwnerOrManager = ['OWNER', 'MANAGER'].includes(userListRef.role)
        const isReviewer = job.reviewerIds?.includes(user.id)
        const isParticipant = isWorker || isOwnerOrManager || isReviewer

        if (!isParticipant) {
          // Limited access for non-participants (e.g., collaborators who aren't assigned)
          return {
            id: job.id,
            status: job.status,
            workerId: job.workerId,
            worker: {
              id: job.worker?.id,
              profiles: job.worker?.profiles
            },
            taskId: job.taskId,
            task: job.task,
            listId: job.listId,
            occurrenceDate: job.occurrenceDate,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            // Don't expose notes, reviews, or detailed info
          }
        }

        // Full access for participants
        return job
      })
      .filter(Boolean) // Remove null entries

    return NextResponse.json({ jobs: processedJobs })
  } catch (error) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { taskId, listId, workerId, status, occurrenceDate, justification, location, selfReview, peerReview, managerReview, reviewerIds, reviewersNoteIds } = body

    // Validate required fields
    if (!taskId || !listId || !workerId) {
      return NextResponse.json({ error: 'Missing required fields: taskId, listId, and workerId are required' }, { status: 400 })
    }

    if (occurrenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) {
      return NextResponse.json({ error: 'Invalid occurrenceDate format. Use YYYY-MM-DD' }, { status: 400 })
    }

    // Authorization checks
    const role = await getUserListRole(user.id, listId)
    if (!role || !JOB_CREATION_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Unauthorized: You must be a member of the list to create jobs' }, { status: 403 })
    }

    if (role === 'COLLABORATOR' && workerId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized: Collaborators can only create jobs for themselves' }, { status: 403 })
    }

    // Collaborators must justify their job request (owners/managers don't have to)
    if (role === 'COLLABORATOR' && (!justification || !String(justification).trim())) {
      return NextResponse.json({ error: 'A justification is required to request a job' }, { status: 400 })
    }

    // Verify task belongs to list
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, listId: true }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (task.listId !== listId) {
      return NextResponse.json({ error: 'Task does not belong to the specified list' }, { status: 400 })
    }

    const job = await prisma.job.create({
      data: {
        taskId,
        listId,
        workerId,
        status: status || 'REQUESTED',
        occurrenceDate: occurrenceDate || null,
        justification: justification !== undefined ? sanitizeText(String(justification)) : null,
        location: location && typeof location === 'object' ? location : null,
        selfReview,
        peerReview,
        managerReview,
        reviewerIds: reviewerIds || [],
        reviewersNoteIds: reviewersNoteIds || []
      },
      include: JOB_INCLUDE
    })

    // Process accepted jobs - initialize invoice and calculate earnings
    if (job.status === 'ACCEPTED') {
      const dateToUse = job.occurrenceDate || formatDateLocal(new Date())
      
      // Initialize invoice with task financial values
      try {
        await initializeJobInvoice(job.id, taskId, listId)
      } catch (invoiceError) {
        console.error('Error initializing job invoice:', invoiceError)
      }
      
      // Update job with current task values
      try {
        await updateJobWithTaskValues(job.id, taskId, listId)
      } catch (taskValuesError) {
        console.error('Error updating job with task values:', taskValuesError)
      }
      
      await updateTaskOccurrenceDates(taskId, 'complete', dateToUse)
      await updateDayProgress(workerId, dateToUse)

      try {
        await calculateAndApplyJobEarnings({ jobId: job.id, taskId, listId, workerId, occurrenceDate: dateToUse })
      } catch (earningsError) {
        console.error('Error calculating job earnings:', earningsError)
      }
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error creating job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
