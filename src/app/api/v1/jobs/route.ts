import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { updateTaskOccurrenceDates } from '@/lib/services/task'
import { updateDayProgress } from '@/lib/services/day'
import { formatDateLocal } from '@/lib/utils/taskUtils'
import { calculateAndApplyJobEarnings } from '@/lib/services/job/earningsService'

// Standard job include clause for consistent responses
const JOB_INCLUDE = {
  task: { select: { id: true, name: true, area: true, categories: true, status: true } },
  list: { select: { id: true, name: true, users: true } },
  worker: { select: { id: true, userId: true, profiles: { select: { username: true, data: true } } } },
  reviewers: { select: { id: true, userId: true, profiles: { select: { username: true, data: true } } } },
  reviewersNotes: true
} as const

// Valid roles for job creation and viewing
const JOB_CREATION_ROLES = ['OWNER', 'MANAGER', 'COLLABORATOR']
const JOB_VIEW_ROLES = ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER']

// Helper function to get user's role in a list
async function getUserListRole(userId: string, listId: string): Promise<string | null> {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { users: true }
  })

  if (!list) return null
  const userRef = list.users.find((ref: any) => ref.userId === userId)
  return userRef?.role || null
}

// Build where clause from search params
function buildJobWhereClause(searchParams: URLSearchParams): Record<string, string> {
  const where: Record<string, string> = {}
  const paramMap = [
    ['listId', 'listId'],
    ['taskId', 'taskId'],
    ['workerId', 'workerId'],
    ['status', 'status'],
    ['date', 'occurrenceDate']
  ]
  paramMap.forEach(([param, field]) => {
    const value = searchParams.get(param)
    if (value) where[field] = value
  })
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

    const authorizedJobs = jobs.filter((job: any) =>
      job.list?.users?.some(
        (ref: any) => ref.userId === user.id && JOB_VIEW_ROLES.includes(ref.role)
      )
    )

    return NextResponse.json({ jobs: authorizedJobs })
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
    const { taskId, listId, workerId, status, occurrenceDate, selfReview, peerReview, managerReview, reviewerIds, reviewersNoteIds } = body

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
        selfReview,
        peerReview,
        managerReview,
        reviewerIds: reviewerIds || [],
        reviewersNoteIds: reviewersNoteIds || []
      },
      include: JOB_INCLUDE
    })

    // Process accepted jobs
    if (job.status === 'ACCEPTED') {
      const dateToUse = job.occurrenceDate || formatDateLocal(new Date())
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
