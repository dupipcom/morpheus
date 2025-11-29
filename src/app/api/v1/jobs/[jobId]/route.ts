import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { checkListMembership, canValidateJob, canDeleteJob, getUserListRole } from '@/lib/utils/listAuthUtils'

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

    // Fetch job with relations
    const job = await prisma.job.findUnique({
      where: { id: jobId },
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

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check if user is a member of the list
    const isMember = await checkListMembership(user.id, job.listId)
    if (!isMember) {
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
      include: {
        list: true
      }
    })

    if (!existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check if user is a member of the list
    const isMember = await checkListMembership(user.id, existingJob.listId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const role = await getUserListRole(user.id, existingJob.listId)

    // Build update data with authorization checks
    const updateData: any = {}

    // Self-review: Only the worker can update
    if (body.selfReview !== undefined) {
      if (user.id !== existingJob.workerId) {
        return NextResponse.json({ error: 'Forbidden: Only the worker can update selfReview' }, { status: 403 })
      }
      updateData.selfReview = body.selfReview
    }

    // Peer/Manager reviews: Only OWNER or MANAGER can update
    if (body.peerReview !== undefined || body.managerReview !== undefined) {
      if (role !== 'OWNER' && role !== 'MANAGER') {
        return NextResponse.json({ error: 'Forbidden: Only OWNER or MANAGER can update peerReview or managerReview' }, { status: 403 })
      }
      if (body.peerReview !== undefined) updateData.peerReview = body.peerReview
      if (body.managerReview !== undefined) updateData.managerReview = body.managerReview
    }

    // Status changes: Check validation rules
    if (body.status !== undefined) {
      const newStatus = body.status
      
      // If changing to ACCEPTED or REJECTED, validate authorization
      if (newStatus === 'ACCEPTED' || newStatus === 'REJECTED') {
        const canValidate = await canValidateJob(user.id, existingJob.listId, existingJob.workerId)
        if (!canValidate) {
          return NextResponse.json({ error: 'Forbidden: Only OWNER or MANAGER can validate jobs, and cannot validate their own job' }, { status: 403 })
        }
      }
      
      // If changing to IN_PROGRESS or VALIDATING, worker can update their own job
      if (newStatus === 'IN_PROGRESS' || newStatus === 'VALIDATING') {
        if (user.id !== existingJob.workerId && role !== 'OWNER' && role !== 'MANAGER') {
          return NextResponse.json({ error: 'Forbidden: Only the worker, OWNER, or MANAGER can update job status to IN_PROGRESS or VALIDATING' }, { status: 403 })
        }
      }
      
      updateData.status = newStatus
    }

    // Reviewer assignment: Only OWNER or MANAGER can assign reviewers
    if (body.reviewerIds !== undefined) {
      if (role !== 'OWNER' && role !== 'MANAGER') {
        return NextResponse.json({ error: 'Forbidden: Only OWNER or MANAGER can assign reviewers' }, { status: 403 })
      }
      updateData.reviewerIds = body.reviewerIds
    }

    // Reviewers notes: Only OWNER or MANAGER can update
    if (body.reviewersNoteIds !== undefined) {
      if (role !== 'OWNER' && role !== 'MANAGER') {
        return NextResponse.json({ error: 'Forbidden: Only OWNER or MANAGER can update reviewersNotes' }, { status: 403 })
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

    return NextResponse.json({ job: updatedJob })
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

    // Fetch job to get listId
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { listId: true }
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Check if user can delete jobs in this list
    const canDelete = await canDeleteJob(user.id, job.listId)
    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden: Only OWNER or MANAGER can delete jobs' }, { status: 403 })
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

