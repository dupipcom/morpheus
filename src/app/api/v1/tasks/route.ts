import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { checkListMembership, canCreateTask } from '@/lib/utils/listAuthUtils'

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
    const status = searchParams.get('status')
    const area = searchParams.get('area')

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

    if (status) {
      whereClause.status = status
    }

    if (area) {
      whereClause.area = area
    }

    // Fetch tasks with relations
    const tasks = await prisma.task.findMany({
      where: whereClause,
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ tasks })
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

    const body = await request.json()
    const { name, categories, area, status, listId, recurrence, nextOccurrence, lastOccurrence, firstOccurrence, times, count, localeKey, persons, things, events, notes, documents, completedOn, dueDate, budget, visibility, quality, redacted, candidateIds } = body

    // Validation
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!area) {
      return NextResponse.json({ error: 'Area is required' }, { status: 400 })
    }

    if (!listId) {
      return NextResponse.json({ error: 'ListId is required' }, { status: 400 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user can create tasks in this list
    const canCreate = await canCreateTask(user.id, listId)
    if (!canCreate) {
      return NextResponse.json({ error: 'Forbidden: Only OWNER or MANAGER can create tasks' }, { status: 403 })
    }

    // Verify list exists and get taskIds
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: { id: true, taskIds: true }
    })

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        name,
        categories: categories || [],
        area,
        status: status || 'OPEN',
        listId,
        recurrence: recurrence || null,
        nextOccurrence: nextOccurrence || null,
        lastOccurrence: lastOccurrence || null,
        firstOccurrence: firstOccurrence || null,
        times: times || null,
        count: count || null,
        localeKey: localeKey || null,
        persons: persons || [],
        things: things || [],
        events: events || [],
        notes: notes || [],
        documents: documents || [],
        completedOn: completedOn || null,
        dueDate: dueDate || null,
        budget: budget || null,
        visibility: visibility || null,
        quality: quality || null,
        redacted: redacted || false,
        candidateIds: candidateIds || [],
        raisedTransactionIds: []
      },
      include: {
        list: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        jobs: true,
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

    // Update list's taskIds array
    const updatedTaskIds = [...(list.taskIds || []), task.id]
    await prisma.list.update({
      where: { id: listId },
      data: {
        taskIds: {
          set: updatedTaskIds
        }
      }
    })

    return NextResponse.json({ task })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
