import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser, getUserListRole } from '@/lib/services/auth'

/**
 * Shared include configuration for task queries with full relations
 */
const taskFullInclude = {
  list: {
    select: {
      id: true,
      name: true,
      users: true
    }
  },
  jobs: {
    include: {
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
  },
  candidates: {
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
  raisedTransactions: true
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    const { taskId } = await params

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: taskFullInclude
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!task.list) {
      return NextResponse.json({ error: 'Task has no associated list' }, { status: 400 })
    }

    const isMember = task.list.users.some(
      (userRef: { userId: string; role: string }) =>
        userRef.userId === user!.id &&
        ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER'].includes(userRef.role)
    )

    if (!isMember) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of the list to view this task' },
        { status: 403 }
      )
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
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    const { taskId } = await params
    const body = await request.json()

    // Fetch existing task
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: {
          select: {
            id: true,
            users: true
          }
        }
      }
    })

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!existingTask.listId) {
      return NextResponse.json({ error: 'Task has no associated list' }, { status: 400 })
    }

    const role = await getUserListRole(user!.id, existingTask.listId)

    if (!role || !['OWNER', 'MANAGER'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can update tasks' },
        { status: 403 }
      )
    }

    const updateData: Record<string, unknown> = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.categories !== undefined) updateData.categories = body.categories
    if (body.area !== undefined) updateData.area = body.area
    if (body.status !== undefined) updateData.status = body.status
    if (body.recurrence !== undefined) updateData.recurrence = body.recurrence
    if (body.nextOccurrence !== undefined)
      updateData.nextOccurrence = body.nextOccurrence ? new Date(body.nextOccurrence) : null
    if (body.lastOccurrence !== undefined)
      updateData.lastOccurrence = body.lastOccurrence ? new Date(body.lastOccurrence) : null
    if (body.firstOccurrence !== undefined)
      updateData.firstOccurrence = body.firstOccurrence ? new Date(body.firstOccurrence) : null
    if (body.times !== undefined) updateData.times = body.times
    // Count is now read-only, calculated from Jobs (removed: if (body.count !== undefined) updateData.count = body.count)
    if (body.localeKey !== undefined) updateData.localeKey = body.localeKey
    if (body.persons !== undefined) updateData.persons = body.persons
    if (body.things !== undefined) updateData.things = body.things
    if (body.events !== undefined) updateData.events = body.events
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.documents !== undefined) updateData.documents = body.documents
    if (body.completedOn !== undefined) updateData.completedOn = body.completedOn
    if (body.dueDate !== undefined)
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (body.budget !== undefined) updateData.budget = body.budget
    if (body.visibility !== undefined) updateData.visibility = body.visibility
    if (body.quality !== undefined) updateData.quality = body.quality
    if (body.redacted !== undefined) updateData.redacted = body.redacted
    if (body.candidateIds !== undefined) updateData.candidateIds = body.candidateIds
    if (body.raisedTransactionIds !== undefined)
      updateData.raisedTransactionIds = body.raisedTransactionIds

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: taskFullInclude
    })

    return NextResponse.json({ task: updatedTask })
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
    const authResult = await getAuthenticatedUser()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { user } = authResult

    const { taskId } = await params

    // Fetch existing task
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: {
          select: {
            id: true,
            users: true
          }
        }
      }
    })

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!existingTask.listId) {
      return NextResponse.json({ error: 'Task has no associated list' }, { status: 400 })
    }

    const role = await getUserListRole(user!.id, existingTask.listId)

    if (!role || !['OWNER', 'MANAGER'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can delete tasks' },
        { status: 403 }
      )
    }
    await prisma.task.delete({
      where: { id: taskId }
    })

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
