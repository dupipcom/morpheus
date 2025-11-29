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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId } = await params

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
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

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check authorization - user must be a member of the list
    const role = await getUserListRole(user.id, job.listId)
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error fetching job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId } = await params
    const body = await request.json()

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch existing job
    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        listId: true,
        operatorId: true,
        status: true
      }
    })

    if (!existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check authorization - user must be a member of the list
    const role = await getUserListRole(user.id, existingJob.listId)
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Prepare update data
    const updateData: any = {}
    const isOperator = user.id === existingJob.operatorId
    const isOwnerOrManager = role === UserRole.OWNER || role === UserRole.MANAGER

    // Self-review: Only the operator can update
    if (body.selfReview !== undefined) {
      if (!isOperator) {
        return NextResponse.json({
          error: 'Forbidden - only the operator can update selfReview'
        }, { status: 403 })
      }
      updateData.selfReview = body.selfReview
    }

    // Peer/Manager reviews: Only OWNER or MANAGER can update
    if (body.peerReview !== undefined || body.managerReview !== undefined) {
      if (!isOwnerOrManager) {
        return NextResponse.json({
          error: 'Forbidden - only OWNER or MANAGER can update peerReview or managerReview'
        }, { status: 403 })
      }
      if (body.peerReview !== undefined) updateData.peerReview = body.peerReview
      if (body.managerReview !== undefined) updateData.managerReview = body.managerReview
    }

    // Status changes
    if (body.status !== undefined) {
      const newStatus = body.status

      // Validation (ACCEPTED/REJECTED): Only OWNER or MANAGER can validate, and cannot validate own job
      if (newStatus === 'ACCEPTED' || newStatus === 'REJECTED') {
        if (!isOwnerOrManager) {
          return NextResponse.json({
            error: 'Forbidden - only OWNER or MANAGER can validate jobs'
          }, { status: 403 })
        }
        if (isOperator) {
          return NextResponse.json({
            error: 'Forbidden - cannot validate your own job'
          }, { status: 403 })
        }
      }

      // IN_PROGRESS/VALIDATING: Operator can update their own job status
      if (newStatus === 'IN_PROGRESS' || newStatus === 'VALIDATING') {
        if (!isOperator && !isOwnerOrManager) {
          return NextResponse.json({
            error: 'Forbidden - only operator or OWNER/MANAGER can update status to IN_PROGRESS or VALIDATING'
          }, { status: 403 })
        }
      }

      updateData.status = newStatus
    }

    // Reviewer assignment: Only OWNER or MANAGER
    if (body.reviewerIds !== undefined) {
      if (!isOwnerOrManager) {
        return NextResponse.json({
          error: 'Forbidden - only OWNER or MANAGER can assign reviewers'
        }, { status: 403 })
      }
      updateData.reviewerIds = body.reviewerIds
    }

    // Update job
    const job = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
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

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error updating job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId } = await params

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch existing job
    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
      select: { listId: true }
    })

    if (!existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check authorization - user must be OWNER or MANAGER
    const role = await getUserListRole(user.id, existingJob.listId)
    if (!role || (role !== UserRole.OWNER && role !== UserRole.MANAGER)) {
      return NextResponse.json({
        error: 'Forbidden - only OWNER or MANAGER can delete jobs'
      }, { status: 403 })
    }

    // Delete job
    await prisma.job.delete({
      where: { id: jobId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
