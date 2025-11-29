import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { migrateUserTasks, migrateSingleList } from '@/lib/utils/taskMigration'

/**
 * Migration endpoint to move tasks from old embedded structure to new Task collection
 *
 * POST /api/v1/migrate/tasks
 * Body: { listId?: string } - Optional, migrate single list. If not provided, migrates all user's lists
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { listId } = body

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { userId }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (listId) {
      // Migrate single list
      // First check if user has access to this list
      const list = await prisma.list.findUnique({
        where: { id: listId },
        select: { users: true }
      })

      if (!list) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 })
      }

      const hasAccess = list.users.some((u: any) => u.userId === user.id)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const result = await migrateSingleList(listId)
      return NextResponse.json(result)
    } else {
      // Migrate all user's lists
      const results = await migrateUserTasks(userId)
      return NextResponse.json({
        success: true,
        results,
        totalLists: results.length,
        totalMigrated: results.reduce((sum, r) => sum + (r.migratedCount || 0), 0)
      })
    }
  } catch (error) {
    console.error('Error migrating tasks:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Get migration status for user's lists
 *
 * GET /api/v1/migrate/tasks
 */
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

    // Find all lists where user is a member
    const lists = await prisma.list.findMany({
      where: {
        users: {
          some: {
            userId: user.id
          }
        }
      },
      select: {
        id: true,
        name: true,
        tasks: true,
        templateTasks: true,
        _count: {
          select: {
            tasks: true // Count from Task collection relation
          }
        }
      }
    })

    const status = lists.map(list => {
      // @ts-ignore
      const embeddedCount = (list.tasks?.length || 0) + (list.templateTasks?.length || 0)
      const collectionCount = list._count.tasks

      return {
        listId: list.id,
        listName: list.name,
        embeddedTasksCount: embeddedCount,
        collectionTasksCount: collectionCount,
        migrationStatus: collectionCount > 0 ? 'migrated' : 'pending',
        needsMigration: embeddedCount > 0 && collectionCount === 0
      }
    })

    return NextResponse.json({
      lists: status,
      summary: {
        totalLists: lists.length,
        migratedLists: status.filter(s => s.migrationStatus === 'migrated').length,
        pendingLists: status.filter(s => s.needsMigration).length
      }
    })
  } catch (error) {
    console.error('Error getting migration status:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
