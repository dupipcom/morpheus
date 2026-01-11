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
  { params }: { params: Promise<{ taskId: string }> }
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

    const { taskId } = await params

    // Fetch task with relations
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
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check authorization - user must be a member of the list
    if (!task.list) {
      return NextResponse.json({ error: 'Task has no associated list' }, { status: 400 })
    }

    const isMember = task.list.users.some(
      (userRef: any) =>
        userRef.userId === user.id &&
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
  { params }: { params: { taskId: string } }
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

    // Check authorization - user must be OWNER or MANAGER of the list
    const role = await getUserListRole(user.id, existingTask.listId)

    if (!role || !['OWNER', 'MANAGER'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can update tasks' },
        { status: 403 }
      )
    }

    // Prepare update data
    const updateData: any = {}

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
    if (body.count !== undefined) updateData.count = body.count
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

    // Update task
    const updatedTask = await prisma.task.update({
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
            }
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
    })

    return NextResponse.json({ task: updatedTask })
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { taskId: string } }
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

    // Check authorization - user must be OWNER or MANAGER of the list
    const role = await getUserListRole(user.id, existingTask.listId)

    if (!role || !['OWNER', 'MANAGER'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can delete tasks' },
        { status: 403 }
      )
    }

    // Delete task (jobs will cascade delete)
    await prisma.task.delete({
      where: { id: taskId }
    })

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
