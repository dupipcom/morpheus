import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { checkListMembership, canModifyTask } from '@/lib/utils/listAuthUtils'

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

    // Fetch task with relations
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        jobs: {
          include: {
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
                content: true
              }
            }
          }
        },
        candidates: {
          select: {
            id: true,
            profiles: {
              select: {
                data: true
              }
            }
          }
        },
        raisedTransactions: {
          select: {
            id: true,
            amount: true,
            type: true,
            status: true,
            createdAt: true
          }
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if user is a member of the list
    if (task.listId) {
      const isMember = await checkListMembership(user.id, task.listId)
      if (!isMember) {
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

    // Fetch task to get listId
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { listId: true }
    })

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!existingTask.listId) {
      return NextResponse.json({ error: 'Task has no associated list' }, { status: 400 })
    }

    // Check if user can modify tasks in this list
    const canModify = await canModifyTask(user.id, existingTask.listId)
    if (!canModify) {
      return NextResponse.json({ error: 'Forbidden: Only OWNER or MANAGER can update tasks' }, { status: 403 })
    }

    // Build update data (only include provided fields)
    const updateData: any = {}
    
    if (body.name !== undefined) updateData.name = body.name
    if (body.categories !== undefined) updateData.categories = body.categories
    if (body.area !== undefined) updateData.area = body.area
    if (body.status !== undefined) updateData.status = body.status
    if (body.recurrence !== undefined) updateData.recurrence = body.recurrence
    if (body.nextOccurrence !== undefined) updateData.nextOccurrence = body.nextOccurrence
    if (body.lastOccurrence !== undefined) updateData.lastOccurrence = body.lastOccurrence
    if (body.firstOccurrence !== undefined) updateData.firstOccurrence = body.firstOccurrence
    if (body.times !== undefined) updateData.times = body.times
    if (body.count !== undefined) updateData.count = body.count
    if (body.localeKey !== undefined) updateData.localeKey = body.localeKey
    if (body.persons !== undefined) updateData.persons = body.persons
    if (body.things !== undefined) updateData.things = body.things
    if (body.events !== undefined) updateData.events = body.events
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.documents !== undefined) updateData.documents = body.documents
    if (body.completedOn !== undefined) updateData.completedOn = body.completedOn
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate
    if (body.budget !== undefined) updateData.budget = body.budget
    if (body.visibility !== undefined) updateData.visibility = body.visibility
    if (body.quality !== undefined) updateData.quality = body.quality
    if (body.redacted !== undefined) updateData.redacted = body.redacted
    if (body.candidateIds !== undefined) updateData.candidateIds = body.candidateIds

    // Update task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        list: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        jobs: {
          include: {
            worker: {
              select: {
                id: true,
                profiles: {
                  select: {
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
            profiles: {
              select: {
                data: true
              }
            }
          }
        },
        raisedTransactions: {
          select: {
            id: true,
            amount: true,
            type: true,
            status: true
          }
        }
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

    // Fetch task to get listId
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { listId: true }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!task.listId) {
      return NextResponse.json({ error: 'Task has no associated list' }, { status: 400 })
    }

    // Check if user can modify tasks in this list
    const canModify = await canModifyTask(user.id, task.listId)
    if (!canModify) {
      return NextResponse.json({ error: 'Forbidden: Only OWNER or MANAGER can delete tasks' }, { status: 403 })
    }

    // Get current list to update taskIds array
    const list = await prisma.list.findUnique({
      where: { id: task.listId },
      select: { taskIds: true }
    })

    // Delete task (jobs will cascade delete per schema)
    await prisma.task.delete({
      where: { id: taskId }
    })

    // Remove taskId from list's taskIds array
    if (list) {
      const updatedTaskIds = (list.taskIds || []).filter(id => id !== taskId)
      await prisma.list.update({
        where: { id: task.listId },
        data: {
          taskIds: {
            set: updatedTaskIds
          }
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
