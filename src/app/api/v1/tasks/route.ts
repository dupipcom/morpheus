import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getUserListRole } from '@/lib/services/auth'
import { getTasksForDate } from '@/lib/services/task'
import { sanitizeText } from '@/lib/utils/sanitize'

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
    const date = searchParams.get('date')
    const status = searchParams.get('status')
    const area = searchParams.get('area')

    // NEW: If date is provided with listId, use date-aware service
    if (date && listId) {
      // Verify user has access to this list
      const list = await prisma.list.findUnique({
        where: { id: listId },
        select: { users: true }
      })

      if (!list) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 })
      }

      const hasAccess = list.users.some(
        (userRef: any) =>
          userRef.userId === user.id &&
          ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER'].includes(userRef.role)
      )

      if (!hasAccess) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Get tasks for the specific date with recurrence filtering
      const tasksForDate = await getTasksForDate(listId, date)

      // Map to response format
      const tasks = tasksForDate.map(({ task, dateStatus, dateCount, completers }) => ({
        ...task,
        dateStatus,      // Date-specific status
        dateCount,       // Date-specific count
        completers,      // Date-specific completers
        taskStatus: task.status  // Keep original task status for reference
      }))

      return NextResponse.json({ tasks, date })
    }

    // EXISTING: Non-date-filtered query (for backwards compatibility)
    // Build where clause
    const whereClause: any = {}

    if (listId) {
      whereClause.listId = listId
    }
    if (status) {
      // Support multiple statuses separated by comma
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean)
      if (statuses.length === 1) {
        whereClause.status = statuses[0]
      } else if (statuses.length > 1) {
        whereClause.status = { in: statuses }
      }
    }
    if (area) {
      whereClause.area = area
    }

    // Fetch tasks
    const tasks = await prisma.task.findMany({
      where: whereClause,
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Filter tasks by membership - user must be a member of the list
    const authorizedTasks = tasks.filter((task: any) => {
      if (!task.list) {
        return false
      }
      return task.list.users.some(
        (userRef: any) =>
          userRef.userId === user.id &&
          ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER'].includes(userRef.role)
      )
    })

    // Calculate count from ACCEPTED jobs (global total across all dates)
    const enrichedTasks = authorizedTasks.map((task: any) => {
      const acceptedJobs = task.jobs?.filter((job: any) => job.status === 'ACCEPTED') || []
      const count = acceptedJobs.length
      const times = task.times || 1

      // Calculate global status based on count
      let status = task.status
      if (count >= times) {
        status = 'DONE'
      } else if (count > 0) {
        status = 'IN_PROGRESS'
      } else {
        status = 'OPEN'
      }

      return {
        ...task,
        count,
        status  // Override with calculated status
      }
    })

    return NextResponse.json({ tasks: enrichedTasks })
  } catch (error) {
    console.error('Error fetching tasks:', error)
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
      name,
      categories,
      area,
      status,
      listId,
      recurrence,
      nextOccurrence,
      lastOccurrence,
      firstOccurrence,
      times,
      count,
      localeKey,
      persons,
      things,
      events,
      notes,
      documents,
      completedOn,
      dueDate,
      budget,
      visibility,
      quality,
      redacted,
      candidateIds,
      raisedTransactionIds
    } = body

    // Validate required fields
    if (!name || !area || !listId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, area, and listId are required' },
        { status: 400 }
      )
    }

    // Sanitize user input to prevent XSS attacks
    const sanitizedName = sanitizeText(name)

    // Check authorization - user must be OWNER or MANAGER of the list
    const role = await getUserListRole(user.id, listId)

    if (!role || !['OWNER', 'MANAGER'].includes(role)) {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can create tasks' },
        { status: 403 }
      )
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        name: sanitizedName,
        categories: categories || [],
        area,
        status: status || 'OPEN',
        listId,
        recurrence,
        nextOccurrence: nextOccurrence ? new Date(nextOccurrence) : undefined,
        lastOccurrence: lastOccurrence ? new Date(lastOccurrence) : undefined,
        firstOccurrence: firstOccurrence ? new Date(firstOccurrence) : undefined,
        times,
        count,
        localeKey,
        persons: persons || [],
        things: things || [],
        events: events || [],
        notes: notes || [],
        documents: documents || [],
        completedOn,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        budget,
        visibility,
        quality,
        redacted,
        candidateIds: candidateIds || [],
        raisedTransactionIds: raisedTransactionIds || []
      },
      include: {
        list: {
          select: {
            id: true,
            name: true,
            users: true
          }
        },
        jobs: true,
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

    return NextResponse.json({ task })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
