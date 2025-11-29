import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { checkListMembership, canCreateJob, getUserListRole } from '@/lib/utils/listAuthUtils'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const listId = searchParams.get('listId')
    const taskId = searchParams.get('taskId')
    const workerId = searchParams.get('workerId')
    const status = searchParams.get('status')

    // Build where clause
    const whereClause: any = {}

    if (listId) {
      // Check if user is a member of the list
      const isMember = await checkListMembership(user.id, listId)
      if (!isMember) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      whereClause.listId = listId
    } else {
      // If no listId specified, get all lists where user is a member
      const userLists = await prisma.list.findMany({
        where: {
          OR: [
            { users: { some: { userId: user.id, role: 'OWNER' } } },
            { users: { some: { userId: user.id, role: 'MANAGER' } } },
            { users: { some: { userId: user.id, role: 'COLLABORATOR' } } },
            { users: { some: { userId: user.id, role: 'FOLLOWER' } } }
          ]
        },
        select: { id: true }
      })
      whereClause.listId = { in: userLists.map(l => l.id) }
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

    // Fetch jobs with relations
    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        task: {
          select: {
            id: true,
            name: true,
            categories: true,
            area: true,
            status: true
          }
        },
        list: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        worker: {
          select: {
            id: true,
            profiles: {
              select: {
                data: true
              }
            }
          }
        },
        reviewers: {
          select: {
            id: true,
            profiles: {
              select: {
                data: true
              }
            }
          }
        },
        reviewersNotes: {
          select: {
            id: true,
            content: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ jobs })
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

    const body = await request.json()
    const { taskId, listId, workerId, status, selfReview, peerReview, managerReview, reviewerIds, reviewersNoteIds } = body

    // Validation
    if (!taskId) {
      return NextResponse.json({ error: 'TaskId is required' }, { status: 400 })
    }

    if (!listId) {
      return NextResponse.json({ error: 'ListId is required' }, { status: 400 })
    }

    if (!workerId) {
      return NextResponse.json({ error: 'WorkerId is required' }, { status: 400 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user can create jobs in this list
    const canCreate = await canCreateJob(user.id, listId)
    if (!canCreate) {
      return NextResponse.json({ error: 'Forbidden: User must be OWNER, MANAGER, or COLLABORATOR' }, { status: 403 })
    }

    // If user is COLLABORATOR, they can only create jobs for themselves
    const role = await getUserListRole(user.id, listId)
    if (role === 'COLLABORATOR' && workerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: COLLABORATORs can only create jobs for themselves' }, { status: 403 })
    }

    // Verify task exists and belongs to the list
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { listId: true }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.listId !== listId) {
      return NextResponse.json({ error: 'Task does not belong to the specified list' }, { status: 400 })
    }

    // Verify list exists
    const list = await prisma.list.findUnique({
      where: { id: listId }
    })

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // Verify worker exists
    const worker = await prisma.user.findUnique({
      where: { id: workerId }
    })

    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }

    // Create job
    const job = await prisma.job.create({
      data: {
        taskId,
        listId,
        workerId,
        status: status || 'REQUESTED',
        selfReview: selfReview || null,
        peerReview: peerReview || null,
        managerReview: managerReview || null,
        reviewerIds: reviewerIds || [],
        reviewersNoteIds: reviewersNoteIds || []
      },
      include: {
        task: {
          select: {
            id: true,
            name: true,
            categories: true,
            area: true,
            status: true
          }
        },
        list: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        worker: {
          select: {
            id: true,
            profiles: {
              select: {
                data: true
              }
            }
          }
        },
        reviewers: {
          select: {
            id: true,
            profiles: {
              select: {
                data: true
              }
            }
          }
        },
        reviewersNotes: {
          select: {
            id: true,
            content: true,
            createdAt: true
          }
        }
      }
    })

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error creating job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
