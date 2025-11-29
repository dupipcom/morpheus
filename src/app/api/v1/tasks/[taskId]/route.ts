import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { UserRole } from '@/lib/prisma'

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
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: {
          select: {
            id: true,
            name: true,
            users: true
          }
        },
        jobs: {
          include: {
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
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check authorization - user must be a member of the list
    if (task.listId) {
      const role = await getUserListRole(user.id, task.listId)
      if (!role) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error('Error fetching task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const body = await request.json()

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch existing task
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { listId: true }
    })

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check authorization - user must be OWNER or MANAGER
    if (existingTask.listId) {
      const role = await getUserListRole(user.id, existingTask.listId)
      if (!role || (role !== UserRole.OWNER && role !== UserRole.MANAGER)) {
        return NextResponse.json({
          error: 'Forbidden - only OWNER or MANAGER can update tasks'
        }, { status: 403 })
      }
    }

    // Prepare update data
    const updateData: any = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.categories !== undefined) updateData.categories = body.categories
    if (body.area !== undefined) updateData.area = body.area
    if (body.status !== undefined) updateData.status = body.status
    if (body.recurrence !== undefined) updateData.recurrence = body.recurrence
    if (body.nextOccurrence !== undefined) {
      updateData.nextOccurrence = body.nextOccurrence ? new Date(body.nextOccurrence) : null
    }
    if (body.localeKey !== undefined) updateData.localeKey = body.localeKey
    if (body.budget !== undefined) updateData.budget = body.budget
    if (body.visibility !== undefined) updateData.visibility = body.visibility
    if (body.quality !== undefined) updateData.quality = body.quality
    if (body.dueDate !== undefined) {
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null
    }
    if (body.candidates !== undefined) updateData.candidates = body.candidates
    if (body.completedOn !== undefined) updateData.completedOn = body.completedOn

    // Update task
    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        list: {
          select: {
            id: true,
            name: true,
            users: true
          }
        },
        jobs: true
      }
    })

    return NextResponse.json({ task })
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch existing task
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { listId: true }
    })

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check authorization - user must be OWNER or MANAGER
    if (existingTask.listId) {
      const role = await getUserListRole(user.id, existingTask.listId)
      if (!role || (role !== UserRole.OWNER && role !== UserRole.MANAGER)) {
        return NextResponse.json({
          error: 'Forbidden - only OWNER or MANAGER can delete tasks'
        }, { status: 403 })
      }
    }

    // Delete task (jobs will cascade delete per schema)
    await prisma.task.delete({
      where: { id: taskId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
