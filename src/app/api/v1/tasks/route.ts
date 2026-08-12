import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { getUserListRole } from '@/lib/services/auth'
import { getTasksForDate } from '@/lib/services/task'
import { resolveListBudget, resolveTaskFinancials } from '@/lib/services/finance/premiumService'
import { sanitizeText } from '@/lib/utils/sanitize'
import { PremiumFactorSettings } from '@/lib/utils/earningsUtils'

const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'STEADY', 'READY', 'DONE', 'IGNORED', 'SKIPPED', 'COMPLETED']
const AREAS = ['self', 'home', 'social', 'work']
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/**
 * GET /api/v1/tasks?date=YYYY-MM-DD&listId=...
 * Date-aware mode: returns the tasks that occur on the given date with
 * date-specific status/count/completers and simplified financials.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find user by Clerk userId (include settings for premium factor calculations)
    const user = await prisma.user.findUnique({
      where: { userId },
      select: {
        id: true,
        settings: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const premiumFactorSettings = user.settings as PremiumFactorSettings | null

    const { searchParams } = new URL(request.url)
    const listId = searchParams.get('listId')
    const date = searchParams.get('date')

    if (!date || !listId) {
      return NextResponse.json({ error: 'Missing required parameters: date and listId' }, { status: 400 })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !OBJECT_ID_PATTERN.test(listId)) {
      return NextResponse.json({ error: 'Invalid date or listId format' }, { status: 400 })
    }

    // Verify user has access to this list and get budget info
    const list = await prisma.list.findUnique({
      where: { id: listId },
      select: {
        users: true,
        role: true,
        budget: true,
        budgetType: true,
        budgetPercent: true,
        budgetSources: { select: { remainingAmount: true } },
        _count: { select: { tasks: true } }
      }
    })

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    const hasAccess = list.users.some(
      (userRef: { userId: string; role: string }) =>
        userRef.userId === user.id &&
        ['OWNER', 'MANAGER', 'COLLABORATOR', 'FOLLOWER'].includes(userRef.role)
    )

    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get tasks for the specific date with RRULE filtering
    const tasksForDate = await getTasksForDate(listId, date, list.role)

    // Map to response format with simplified financials
    const listBudget = resolveListBudget(list)
    const numTasks = list._count.tasks

    const tasks = tasksForDate.map(({ task, dateStatus, dateCount, completers }) => {
      const financials = resolveTaskFinancials(task, listBudget, numTasks, premiumFactorSettings)

      return {
        ...task,
        premium: financials.premium,
        totalGains: financials.totalGains,
        dateStatus,      // Date-specific status
        dateCount,       // Date-specific count
        completers,      // Date-specific completers
        taskStatus: task.status  // Keep original task status for reference
      }
    })

    return NextResponse.json({ tasks, date })
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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      name, listId, rrule, dtstart, times, premium, premiumType, location,
      categories, area, status, visibility, quality, redacted, candidateIds, localeKey
    } = body as Record<string, unknown>

    // Validate required fields
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
    }
    if (typeof listId !== 'string' || !OBJECT_ID_PATTERN.test(listId)) {
      return NextResponse.json({ error: 'Missing required field: listId' }, { status: 400 })
    }

    // Sanitize user input to prevent XSS attacks
    const sanitizedName = sanitizeText(name)

    if (status !== undefined && (typeof status !== 'string' || !TASK_STATUSES.includes(status))) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (area !== undefined && (typeof area !== 'string' || !AREAS.includes(area))) {
      return NextResponse.json({ error: 'Invalid area' }, { status: 400 })
    }
    if (premiumType !== undefined && premiumType !== null && !['FIAT', 'PERCENT'].includes(String(premiumType))) {
      return NextResponse.json({ error: 'Invalid premiumType' }, { status: 400 })
    }
    if (rrule !== undefined && rrule !== null && typeof rrule !== 'string') {
      return NextResponse.json({ error: 'rrule must be a string' }, { status: 400 })
    }

    let parsedCandidateIds: string[] = []
    if (candidateIds !== undefined) {
      if (!Array.isArray(candidateIds) || !candidateIds.every((v) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) {
        return NextResponse.json({ error: 'candidateIds must be an array of user IDs' }, { status: 400 })
      }
      parsedCandidateIds = candidateIds as string[]
    }

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
        categories: (Array.isArray(categories) && categories.every((c) => typeof c === 'string') ? categories as string[] : []) as never,
        area: (typeof area === 'string' ? area : 'self') as never,
        status: typeof status === 'string' ? status as never : 'OPEN',
        listId,
        rrule: rrule !== undefined ? (rrule as string | null) : null,
        dtstart: typeof dtstart === 'string' ? dtstart : null,
        times: typeof times === 'number' && times > 0 ? times : null,
        premium: typeof premium === 'number' ? premium : null,
        premiumType: typeof premiumType === 'string' ? premiumType : null,
        location: location && typeof location === 'object' ? location : null,
        localeKey: typeof localeKey === 'string' ? localeKey : null,
        visibility: visibility as never,
        quality: typeof quality === 'number' ? quality : null,
        redacted: typeof redacted === 'boolean' ? redacted : false,
        candidateIds: parsedCandidateIds
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
