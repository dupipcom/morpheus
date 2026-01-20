import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { migrateListTasks, listNeedsMigration } from '@/lib/services/task'

/**
 * POST /api/v1/tasks/migrate
 * Migrate old embedded tasks to the new Task collection
 *
 * Body: { listId: string, taskKeys?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find user by Clerk userId
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { listId, taskKeys } = body

    if (!listId) {
      return NextResponse.json({ error: 'Missing required field: listId' }, { status: 400 })
    }

    // Validate listId format
    if (typeof listId !== 'string' || listId.length !== 24 || !/^[a-f0-9]+$/i.test(listId)) {
      return NextResponse.json({ error: 'Invalid listId format' }, { status: 400 })
    }

    // Fetch the list and verify user authorization
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: {
        id: true,
        users: true
      }
    })

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // Check user's role in the list
    const userRef = list.users.find((u: any) => u.userId === user.id)
    const userRole = userRef?.role

    if (!userRole || !['OWNER', 'MANAGER'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can migrate tasks' },
        { status: 403 }
      )
    }

    // Validate taskKeys if provided
    if (taskKeys !== undefined) {
      if (!Array.isArray(taskKeys)) {
        return NextResponse.json({ error: 'taskKeys must be an array' }, { status: 400 })
      }
      if (!taskKeys.every(k => typeof k === 'string')) {
        return NextResponse.json({ error: 'taskKeys must be an array of strings' }, { status: 400 })
      }
    }

    // Perform migration
    const result = await migrateListTasks({
      listId,
      userId: user.id,
      taskKeys
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error migrating tasks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/v1/tasks/migrate?listId=xxx
 * Check if a list needs migration
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find user by Clerk userId
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const listId = searchParams.get('listId')

    if (!listId) {
      return NextResponse.json({ error: 'Missing required query parameter: listId' }, { status: 400 })
    }

    // Validate listId format
    if (typeof listId !== 'string' || listId.length !== 24 || !/^[a-f0-9]+$/i.test(listId)) {
      return NextResponse.json({ error: 'Invalid listId format' }, { status: 400 })
    }

    // Fetch the list and verify user has access
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: {
        id: true,
        users: true
      }
    })

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // Check user has membership in the list
    const userRef = list.users.find((u: any) => u.userId === user.id)
    if (!userRef) {
      return NextResponse.json({ error: 'Unauthorized: Not a member of this list' }, { status: 403 })
    }

    // Check migration status
    const status = await listNeedsMigration(listId)

    return NextResponse.json(status)
  } catch (error) {
    console.error('Error checking migration status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
