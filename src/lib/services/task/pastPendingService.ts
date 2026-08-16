import prisma from '@/lib/prisma'
import type { Job, Task, TaskStatus } from '@/generated/prisma/client'
import { deriveDateStatus } from './recurrenceService'

/**
 * Job statuses that count as "pending or under review" for past occurrences
 */
export const PAST_PENDING_JOB_STATUSES = ['REQUESTED', 'IN_PROGRESS', 'SUBMITTED', 'VALIDATING'] as const

/**
 * A past occurrence of a task that still has pending/review work:
 * one entry per (taskId, occurrenceDate) — a legacy stateless row may have
 * pending jobs on several past dates and gets one entry per date.
 */
export interface PastPendingEntry {
  task: Task
  /** All jobs for this (task, occurrenceDate), newest first */
  jobs: Job[]
  occurrenceDate: string
  /** Date-scoped status derived from ACCEPTED jobs only (see deriveDateStatus) */
  dateStatus: TaskStatus
  dateCount: number
}

export interface PastPendingCursor {
  occurrenceDate: string
  id: string
}

/**
 * Get past occurrences of a list's tasks that are still pending or under
 * review, paginated newest-occurrence-first.
 *
 * @param before - Upper bound (exclusive) for occurrenceDate, YYYY-MM-DD
 * @param windowStart - Lower bound applied only on the first page (no cursor)
 * @param cursor - Composite (occurrenceDate, id) cursor from a previous page
 */
export async function getPastPendingEntries(params: {
  listId: string
  before: string
  windowStart?: string
  cursor?: PastPendingCursor
  limit: number
}): Promise<{ entries: PastPendingEntry[]; nextCursor: PastPendingCursor | null }> {
  const { listId, before, windowStart, cursor, limit } = params

  const occurrenceDateFilter: Record<string, unknown> = { not: null, lt: before }
  if (windowStart && !cursor) {
    occurrenceDateFilter.gte = windowStart
  }

  const where: Record<string, unknown> = {
    listId,
    status: { in: [...PAST_PENDING_JOB_STATUSES] },
    occurrenceDate: occurrenceDateFilter
  }

  // Composite cursor: occurrenceDate is not unique, so tie-break on id
  // (ObjectId hex strings sort in creation order). Only applied on later pages.
  if (cursor) {
    delete occurrenceDateFilter.gte
    where.OR = [
      { occurrenceDate: { lt: cursor.occurrenceDate } },
      { occurrenceDate: cursor.occurrenceDate, id: { lt: cursor.id } }
    ]
  }

  // Fetch limit + 1 to detect whether another page exists
  const pageJobs = await prisma.job.findMany({
    where: where as never,
    include: {
      task: true,
      worker: {
        select: { id: true, userId: true, profiles: { select: { username: true, data: true } } }
      }
    },
    orderBy: [{ occurrenceDate: 'desc' }, { id: 'desc' }],
    take: limit + 1
  })

  const hasMore = pageJobs.length > limit
  const jobs = pageJobs.slice(0, limit)
  const nextCursor = hasMore
    ? {
        occurrenceDate: jobs[jobs.length - 1].occurrenceDate as string,
        id: jobs[jobs.length - 1].id
      }
    : null

  // Group by (taskId, occurrenceDate), then enrich each group with the
  // occurrence's full job set so dateCount/badges are complete
  const groups = new Map<string, { task: Task; occurrenceDate: string }>()
  const orderedKeys: string[] = []
  for (const job of jobs) {
    const occurrenceDate = job.occurrenceDate as string
    const key = `${job.taskId}|${occurrenceDate}`
    if (!groups.has(key)) {
      groups.set(key, { task: job.task, occurrenceDate })
      orderedKeys.push(key)
    }
  }

  const entries: PastPendingEntry[] = []
  if (orderedKeys.length > 0) {
    const taskIds = Array.from(new Set(orderedKeys.map((key) => key.split('|')[0])))
    const occurrenceDates = Array.from(new Set(orderedKeys.map((key) => key.split('|')[1])))

    const allJobs = await prisma.job.findMany({
      where: {
        taskId: { in: taskIds },
        occurrenceDate: { in: occurrenceDates }
      },
      include: {
        task: true,
        worker: {
          select: { id: true, userId: true, profiles: { select: { username: true, data: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const jobsByKey = new Map<string, Job[]>()
    for (const job of allJobs) {
      const key = `${job.taskId}|${job.occurrenceDate}`
      if (!jobsByKey.has(key)) jobsByKey.set(key, [])
      jobsByKey.get(key)!.push(job)
    }

    for (const key of orderedKeys) {
      const group = groups.get(key)!
      const groupJobs = jobsByKey.get(key) || []
      const acceptedCount = groupJobs.filter((j) => j.status === 'ACCEPTED').length
      entries.push({
        task: group.task,
        jobs: groupJobs,
        occurrenceDate: group.occurrenceDate,
        dateStatus: deriveDateStatus(group.task, acceptedCount, group.task.times),
        dateCount: acceptedCount
      })
    }
  }

  return { entries, nextCursor }
}
