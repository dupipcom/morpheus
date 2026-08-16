import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { getPastPendingEntries } from '@/lib/services/task'
import { resolveListBudget, resolveTaskFinancials } from '@/lib/services/finance/premiumService'
import { PremiumFactorSettings } from '@/lib/utils/earningsUtils'
import { formatDateLocal } from '@/lib/utils/taskUtils'

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/v1/tasks/past-pending?listId=...&before=YYYY-MM-DD
 * Past occurrences of the list's tasks that are still pending or under review
 * (jobs in REQUESTED/IN_PROGRESS/SUBMITTED/VALIDATING), newest occurrence first.
 *
 * Pagination: composite cursor via cursorDate + cursorId from nextCursor.
 * The optional windowStart (e.g. before - 7 days) is applied only on the first
 * page; later pages can page into older entries (infinite scroll).
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
    const before = searchParams.get('before')
    const windowStart = searchParams.get('windowStart')
    const cursorDate = searchParams.get('cursorDate')
    const cursorId = searchParams.get('cursorId')
    const limitParam = searchParams.get('limit')

    if (!listId || !OBJECT_ID_PATTERN.test(listId)) {
      return NextResponse.json({ error: 'Missing or invalid listId' }, { status: 400 })
    }

    if (before && !DATE_PATTERN.test(before)) {
      return NextResponse.json({ error: 'Invalid before format (YYYY-MM-DD)' }, { status: 400 })
    }
    if (windowStart && !DATE_PATTERN.test(windowStart)) {
      return NextResponse.json({ error: 'Invalid windowStart format (YYYY-MM-DD)' }, { status: 400 })
    }
    if ((cursorDate && !cursorId) || (!cursorDate && cursorId)) {
      return NextResponse.json({ error: 'cursorDate and cursorId must be provided together' }, { status: 400 })
    }
    if (cursorDate && !DATE_PATTERN.test(cursorDate)) {
      return NextResponse.json({ error: 'Invalid cursorDate format (YYYY-MM-DD)' }, { status: 400 })
    }
    if (cursorId && !OBJECT_ID_PATTERN.test(cursorId)) {
      return NextResponse.json({ error: 'Invalid cursorId format' }, { status: 400 })
    }

    const limit = limitParam ? parseInt(limitParam) : 20
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return NextResponse.json({ error: 'limit must be between 1 and 50' }, { status: 400 })
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

    const viewerRole = await getViewerRole(user.id, 'list', list)

    if (viewerRole === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const effectiveBefore = before || formatDateLocal(new Date())

    const { entries: pastEntries, nextCursor } = await getPastPendingEntries({
      listId,
      before: effectiveBefore,
      windowStart: windowStart || undefined,
      cursor: cursorDate && cursorId ? { occurrenceDate: cursorDate, id: cursorId } : undefined,
      limit
    })

    // Map to response format with simplified financials (same as GET /tasks)
    const listBudget = resolveListBudget(list)
    const numTasks = list._count.tasks

    const entries = pastEntries.map(({ task, jobs, occurrenceDate, dateStatus, dateCount }) => {
      const financials = resolveTaskFinancials(task, listBudget, numTasks, premiumFactorSettings)

      return {
        ...task,
        premium: financials.premium,
        totalGains: financials.totalGains,
        jobs,
        occurrenceDate, // Date this past occurrence applies to
        dateStatus,     // Date-specific status (ACCEPTED jobs only)
        dateCount,      // Date-specific count
        taskStatus: task.status  // Keep original task status for reference
      }
    })

    return NextResponse.json({ entries, nextCursor })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error fetching past pending tasks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
