import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'

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

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
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

    const { jobId } = params

    // Fetch job with relations
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
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
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check authorization - user must be a member of the list
    if (!job.list) {
      return NextResponse.json({ error: 'Job has no associated list' }, { status: 400 })
    }

    const isMember = job.list.users.some(
      (userRef: any) =>
        userRef.userId === user.id &&
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

    const { jobId } = params
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

    // Check list membership
    const role = await getUserListRole(user.id, existingJob.listId)

    if (!role || !['OWNER', 'MANAGER', 'COLLABORATOR'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of the list to update this job' },
        { status: 403 }
      )
    }

    const isOwnerOrManager = ['OWNER', 'MANAGER'].includes(role)
    const isWorker = existingJob.workerId === user.id

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

    // Update job
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
      include: {
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
    })

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

    const { jobId } = params

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

    // Check authorization - user must be OWNER or MANAGER of the list
    const role = await getUserListRole(user.id, existingJob.listId)

    if (!role || !['OWNER', 'MANAGER'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can delete jobs' },
        { status: 403 }
      )
    }

    // Delete job
    await prisma.job.delete({
      where: { id: jobId }
    })

    return NextResponse.json({ message: 'Job deleted successfully' })
  } catch (error) {
    console.error('Error deleting job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
