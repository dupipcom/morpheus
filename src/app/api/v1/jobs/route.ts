import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { UserRole } from '@/generated/prisma'

// Helper to check list membership and get user role
async function getUserListRole(userId: string, listId: string): Promise<UserRole | null> {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { users: true }
  })

  if (!list) return null

  const userRef = list.users.find(u => u.userId === userId)
  return userRef ? userRef.role : null
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const listId = searchParams.get('listId')
    const taskId = searchParams.get('taskId')
    const operatorId = searchParams.get('operatorId')
    const status = searchParams.get('status')

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build where clause
    const where: any = {}

    if (listId) {
      // Check list membership
      const role = await getUserListRole(user.id, listId)
      if (!role) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      where.listId = listId
    }

    if (taskId) {
      where.taskId = taskId
    }

    if (operatorId) {
      where.operatorId = operatorId
    }

    if (status) {
      where.status = status
    }

    // Fetch jobs
    const jobs = await prisma.job.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            name: true,
            localeKey: true,
            area: true,
            categories: true
          }
        },
        list: {
          select: {
            id: true,
            name: true,
            users: true
          }
        },
        operator: {
          select: {
            id: true,
            profiles: {
              select: {
                username: true,
                data: true
              }
            }
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
    const {
      taskId,
      listId,
      operatorId,
      status,
      reviewerIds,
      selfReview,
      peerReview,
      managerReview
    } = body

    if (!taskId || !listId || !operatorId) {
      return NextResponse.json({
        error: 'taskId, listId, and operatorId are required'
      }, { status: 400 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check authorization - user must be OWNER, MANAGER, or COLLABORATOR
    const role = await getUserListRole(user.id, listId)
    if (!role || role === UserRole.FOLLOWER) {
      return NextResponse.json({
        error: 'Forbidden - FOLLOWER role cannot create jobs'
      }, { status: 403 })
    }

    // COLLABORATORs can only create jobs for themselves
    if (role === UserRole.COLLABORATOR && operatorId !== user.id) {
      return NextResponse.json({
        error: 'Forbidden - COLLABORATORs can only create jobs for themselves'
      }, { status: 403 })
    }

    // Create job
    const job = await prisma.job.create({
      data: {
        taskId,
        listId,
        operatorId,
        status: status || 'REQUESTED',
        reviewerIds: reviewerIds || [],
        selfReview,
        peerReview,
        managerReview
      },
      include: {
        task: {
          select: {
            id: true,
            name: true,
            localeKey: true,
            area: true,
            categories: true
          }
        },
        list: {
          select: {
            id: true,
            name: true,
            users: true
          }
        },
        operator: {
          select: {
            id: true,
            profiles: {
              select: {
                username: true,
                data: true
              }
            }
          }
        }
      }
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    console.error('Error creating job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
