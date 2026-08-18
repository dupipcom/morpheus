import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/services/auth'
import { ApiError, toResponse } from '@/lib/services/errors'
import { getViewerRole } from '@/lib/services/ownership'
import { resolveListBudget, resolveTaskFinancials } from '@/lib/services/finance/premiumService'
import { reverseJobEarnings } from '@/lib/services/job/earningsService'
import { sanitizeText } from '@/lib/utils/sanitize'
import { PremiumFactorSettings } from '@/lib/utils/earningsUtils'

const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'STEADY', 'READY', 'DONE', 'IGNORED', 'SKIPPED', 'COMPLETED']
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

/**
 * Cap an RRULE string so the task stops occurring after `untilDate` (YYYY-MM-DD)
 * Returns null for one-off tasks (caller handles status instead).
 */
function capRRule(rrule: string | null | undefined, untilDate: string): string | null {
  if (!rrule) return null
  const until = `${untilDate.replace(/-/g, '')}T000000Z`
  const withoutExistingUntil = rrule.replace(/;UNTIL=[^;]+/i, '')
  return `${withoutExistingUntil};UNTIL=${until}`
}

/**
 * Soft-cancel jobs for a task (reversing earnings) within a date window.
 * Jobs are never hard-deleted: they carry financial history.
 */
async function cancelTaskJobs(
  taskId: string,
  window: { fromDate?: string; exactDate?: string }
): Promise<void> {
  const jobs = await prisma.job.findMany({
    where: {
      taskId,
      status: { in: ['ACCEPTED', 'IN_PROGRESS', 'REQUESTED', 'SUBMITTED', 'VALIDATING'] },
      ...(window.exactDate
        ? { occurrenceDate: window.exactDate }
        : { occurrenceDate: { gte: window.fromDate } })
    },
    select: { id: true, workerId: true, occurrenceDate: true, status: true }
  })

  for (const job of jobs) {
    // Reverse earnings for accepted jobs before cancelling (financial integrity)
    if (job.status === 'ACCEPTED' && job.occurrenceDate) {
      try {
        await reverseJobEarnings({
          jobId: job.id,
          workerId: job.workerId,
          occurrenceDate: job.occurrenceDate
        })
      } catch (error) {
        console.error(`Error reversing earnings for job ${job.id}:`, error)
      }
    }
  }

  await prisma.job.updateMany({
    where: {
      taskId,
      status: { in: ['ACCEPTED', 'IN_PROGRESS', 'REQUESTED', 'SUBMITTED', 'VALIDATING'] },
      ...(window.exactDate
        ? { occurrenceDate: window.exactDate }
        : { occurrenceDate: { gte: window.fromDate } })
    },
    data: { status: 'CANCELLED' }
  })
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
      include: {
        list: {
          select: {
            id: true,
            name: true,
            role: true,
            users: true,
            budget: true,
            budgetType: true,
            budgetPercent: true,
            budgetSources: { select: { remainingAmount: true } },
            _count: { select: { tasks: true } }
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

    if (!task.list) {
      return NextResponse.json({ error: 'Task has no associated list' }, { status: 400 })
    }

    const viewerRole = await getViewerRole(user!.id, 'task', task)

    if (viewerRole === null) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of the list to view this task' },
        { status: 403 }
      )
    }

    // Fetch user's premium factor settings
    const userWithSettings = await prisma.user.findUnique({
      where: { id: user!.id },
      select: { settings: true }
    })
    const premiumFactorSettings = userWithSettings?.settings as PremiumFactorSettings | null

    // Simplified financials: premium (fiat or % of list budget) + equal share of budget
    const listBudget = resolveListBudget(task.list)
    const financials = resolveTaskFinancials(
      task,
      listBudget,
      task.list._count.tasks,
      premiumFactorSettings
    )

    const taskWithFinancials = {
      ...task,
      premium: financials.premium,
      totalGains: financials.totalGains
    }

    return NextResponse.json({ task: taskWithFinancials })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
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
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

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

    const role = await getViewerRole(user!.id, 'task', existingTask)

    if (role !== 'OWNER' && role !== 'MANAGER' && role !== 'COLLABORATOR') {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners, managers, and collaborators can update tasks' },
        { status: 403 }
      )
    }

    const updateData: Record<string, unknown> = {}

    // Sanitize name if it's being updated
    if (body.name !== undefined) updateData.name = sanitizeText(body.name)
    if (body.categories !== undefined) updateData.categories = body.categories
    if (body.area !== undefined) updateData.area = body.area
    if (body.status !== undefined) {
      if (!TASK_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = body.status
      // Setting the task to completed records when (criterion 5)
      if (body.status === 'COMPLETED' && !existingTask.completedOn) {
        updateData.completedOn = new Date().toISOString().slice(0, 10)
      }
      if (body.status !== 'COMPLETED' && existingTask.status === 'COMPLETED') {
        updateData.completedOn = null
      }
    }
    if (body.rrule !== undefined) updateData.rrule = body.rrule
    if (body.dtstart !== undefined) updateData.dtstart = body.dtstart
    if (body.times !== undefined) updateData.times = body.times
    if (body.premium !== undefined) updateData.premium = body.premium
    if (body.premiumType !== undefined) updateData.premiumType = body.premiumType
    if (body.location !== undefined) updateData.location = body.location
    if (body.localeKey !== undefined) updateData.localeKey = body.localeKey
    if (body.persons !== undefined) updateData.persons = body.persons
    if (body.things !== undefined) updateData.things = body.things
    if (body.events !== undefined) updateData.events = body.events
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.completedOn !== undefined) updateData.completedOn = body.completedOn
    if (body.dueDate !== undefined)
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (body.visibility !== undefined) updateData.visibility = body.visibility
    if (body.quality !== undefined) updateData.quality = body.quality
    if (body.redacted !== undefined) updateData.redacted = body.redacted
    // Job-post fields (Phase 5)
    if (body.jobDescription !== undefined) updateData.jobDescription = sanitizeText(body.jobDescription)
    if (body.requirements !== undefined) updateData.requirements = sanitizeText(body.requirements)
    if (body.openings !== undefined) {
      if (typeof body.openings !== 'number' || body.openings < 1) {
        return NextResponse.json({ error: 'openings must be a positive number' }, { status: 400 })
      }
      updateData.openings = body.openings
    }
    if (body.applyBy !== undefined) updateData.applyBy = body.applyBy
    if (body.candidateIds !== undefined) updateData.candidateIds = body.candidateIds
    if (body.raisedTransactionIds !== undefined)
      updateData.raisedTransactionIds = body.raisedTransactionIds
    if (body.documentIds !== undefined) {
      if (!Array.isArray(body.documentIds) || !body.documentIds.every((v: unknown) => typeof v === 'string' && OBJECT_ID_PATTERN.test(v))) {
        return NextResponse.json({ error: 'documentIds must be an array of document IDs' }, { status: 400 })
      }
      updateData.documentIds = body.documentIds
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData
    })

    return NextResponse.json({ task: updatedTask })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/v1/tasks/[taskId]?scope=all|onwards|today&date=YYYY-MM-DD
 * - all (default): delete the task and its jobs
 * - today: cancel the jobs on the given date (earnings reversed)
 * - onwards: cancel jobs from the given date onwards and stop the task
 *   occurring from that date (RRULE UNTIL cap, or COMPLETED for one-off tasks)
 */
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
    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope') || 'all'
    const date = searchParams.get('date')

    if (!['all', 'onwards', 'today'].includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope: use all, onwards, or today' }, { status: 400 })
    }
    if (scope !== 'all' && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      return NextResponse.json({ error: 'A valid date (YYYY-MM-DD) is required for this scope' }, { status: 400 })
    }

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

    const role = await getViewerRole(user!.id, 'task', existingTask)

    if (role !== 'OWNER' && role !== 'MANAGER') {
      return NextResponse.json(
        { error: 'Unauthorized: Only list owners and managers can delete tasks' },
        { status: 403 }
      )
    }

    if (scope === 'today') {
      await cancelTaskJobs(taskId, { exactDate: date! })
      return NextResponse.json({ message: 'Task entries for this date cancelled' })
    }

    if (scope === 'onwards') {
      await cancelTaskJobs(taskId, { fromDate: date! })

      // Stop the task from occurring on the target date onwards
      const capped = capRRule(existingTask.rrule, date!)
      if (capped) {
        await prisma.task.update({
          where: { id: taskId },
          data: { rrule: capped }
        })
      } else {
        // One-off task: mark completed as of the day before
        const dayBefore = new Date(`${date!}T00:00:00Z`)
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: 'COMPLETED',
            completedOn: dayBefore.toISOString().slice(0, 10)
          }
        })
      }
      return NextResponse.json({ message: 'Task entries from this date onwards cancelled' })
    }

    // scope === 'all': delete the task (jobs cascade)
    await prisma.task.delete({
      where: { id: taskId }
    })

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    if (error instanceof ApiError) {
      return toResponse(error)
    }
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
