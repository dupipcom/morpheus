import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { updateTaskOccurrenceDates } from '@/lib/services/task'
import { formatDateLocal } from '@/lib/utils/taskUtils'

// Helper function to get user's role in a list
async function getUserListRole(userId: string, listId: string): Promise<string | null> {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: {
      users: true
    }
  })

  if (!list) {
    return null
  }

  const userRef = list.users.find((ref: any) => ref.userId === userId)
  return userRef?.role || null
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find user by Clerk userId
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const listId = searchParams.get('listId')
    const taskId = searchParams.get('taskId')
    const workerId = searchParams.get('workerId')
    const status = searchParams.get('status')
    const date = searchParams.get('date')

    // Build where clause
    const whereClause: any = {}

    if (listId) {
      whereClause.listId = listId
    }
    if (taskId) {
      whereClause.taskId = taskId
    }
    if (workerId) {
      whereClause.workerId = workerId
    }
    if (status) {
      whereClause.status = status
    }
    if (date) {
      whereClause.occurrenceDate = date
    }

    // Fetch jobs
    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        task: {
          select: {
            id: true,
            name: true,
            area: true,
            categories: true,
            status: true
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Filter jobs by membership - user must be a member of the list
    const authorizedJobs = jobs.filter((job: any) => {
      if (!job.list) {
        return false
      }
      return job.list.users.some(
        (userRef: any) =>
          userRef.userId === user.id &&
          ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER'].includes(userRef.role)
      )
    })

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

    // Find user by Clerk userId
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      taskId,
      listId,
      workerId,
      status,
      occurrenceDate,
      selfReview,
      peerReview,
      managerReview,
      reviewerIds,
      reviewersNoteIds
    } = body

    // Validate required fields
    if (!taskId || !listId || !workerId) {
      return NextResponse.json(
        { error: 'Missing required fields: taskId, listId, and workerId are required' },
        { status: 400 }
      )
    }

    // Validate occurrenceDate format if provided
    if (occurrenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) {
      return NextResponse.json(
        { error: 'Invalid occurrenceDate format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Check authorization - user must be OWNER, MANAGER, or COLLABORATOR of the list
    const role = await getUserListRole(user.id, listId)

    if (!role || !['OWNER', 'MANAGER', 'COLLABORATOR'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of the list to create jobs' },
        { status: 403 }
      )
    }

    // If user is COLLABORATOR, they can only create jobs for themselves
    if (role === 'COLLABORATOR' && workerId !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Collaborators can only create jobs for themselves' },
        { status: 403 }
      )
    }

    // Verify the task exists and belongs to the list
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        listId: true
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.listId !== listId) {
      return NextResponse.json(
        { error: 'Task does not belong to the specified list' },
        { status: 400 }
      )
    }

    // Create job
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
      include: {
        task: {
          select: {
            id: true,
            name: true,
            area: true,
            categories: true,
            status: true
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
    })

    // Update task occurrence dates if job is ACCEPTED
    if (job.status === 'ACCEPTED') {
      const dateToUse = job.occurrenceDate || formatDateLocal(new Date())
      await updateTaskOccurrenceDates(taskId, 'complete', dateToUse)
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error creating job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
