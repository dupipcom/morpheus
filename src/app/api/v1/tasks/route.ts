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
    const status = searchParams.get('status')
    const area = searchParams.get('area')

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

    if (status) {
      where.status = status
    }

    if (area) {
      where.area = area
    }

    // Fetch tasks
    const tasks = await prisma.task.findMany({
      where,
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
    const {
      name,
      categories,
      area,
      status,
      listId,
      recurrence,
      nextOccurrence,
      localeKey,
      budget,
      visibility,
      quality,
      dueDate
    } = body

    if (!name || !area || !listId) {
      return NextResponse.json({
        error: 'Name, area, and listId are required'
      }, { status: 400 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check authorization - user must be OWNER or MANAGER
    const role = await getUserListRole(user.id, listId)
    if (!role || (role !== UserRole.OWNER && role !== UserRole.MANAGER)) {
      return NextResponse.json({
        error: 'Forbidden - only OWNER or MANAGER can create tasks'
      }, { status: 403 })
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        name,
        categories: categories || [],
        area,
        status: status || 'OPEN',
        listId,
        recurrence,
        nextOccurrence: nextOccurrence ? new Date(nextOccurrence) : undefined,
        localeKey,
        budget,
        visibility: visibility || 'PRIVATE',
        quality,
        dueDate: dueDate ? new Date(dueDate) : undefined
      },
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

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
