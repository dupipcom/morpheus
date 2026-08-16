/**
 * Dimension → Prisma select/where mapping + payload compaction.
 * Single source of truth for what the assistant's MongoDB query returns:
 * only the fields required by the selected dashboard dimensions.
 * `analysis` and `productivity` are NEVER selected (recursion guard — they
 * contain the assistant's own output).
 */

import type { Prisma } from '@/generated/prisma/client'
import type { MoodKey } from '@/lib/services/day'
import { MOOD_DIMENSIONS } from './types'
import type { AgentDimension, CompactDay, CompactTask } from './types'

const MAX_TASKS_PER_DAY = 20
const MAX_TASK_NAME_LENGTH = 80

const TASK_SELECT = {
  name: true,
  area: true,
  status: true,
  count: true,
  times: true
} satisfies Prisma.EmbeddedTaskSelect

/** Raw Day row shape returned by buildDaySelectForDimensions (fields are optional — the select is dynamic) */
export interface AgentDayRecord {
  date: string | null
  week: number | null
  month: number | null
  average?: number | null
  mood?: Partial<Record<MoodKey, number>> | null
  progress?: number | null
  ticker?: Array<{ earnings?: number | null; premium?: number | null }> | null
  stash?: number | null
  withdrawn?: number | null
  balance?: number | null
  tasks?: Array<{
    name: string
    area?: string | null
    status: string
    count?: number | null
    times?: number | null
  }>
}

/**
 * Build the minimal Day select for the given dimensions.
 * Always includes date/week/month and the compact task summary.
 */
export function buildDaySelectForDimensions(dims: AgentDimension[]): Prisma.DaySelect {
  const select: Prisma.DaySelect = {
    date: true,
    week: true,
    month: true,
    tasks: { select: TASK_SELECT }
  }

  if (dims.includes('moodAverage')) {
    // mood is needed as fallback when average is null (mirrors transformDayForAnalytics)
    select.average = true
    select.mood = true
  }

  if (MOOD_DIMENSIONS.some((key) => dims.includes(key))) {
    select.mood = true
  }

  if (dims.includes('progress')) select.progress = true
  if (dims.includes('profit')) select.ticker = true
  if (dims.includes('stash')) select.stash = true
  if (dims.includes('withdrawn')) select.withdrawn = true
  if (dims.includes('balance')) select.balance = true

  return select
}

/**
 * Build the Day where clause. Date filtering uses string comparison on
 * Day.date (YYYY-MM-DD) — the established pattern across the API.
 */
export function buildDayWhere(
  targetUserId: string,
  startDate?: string,
  endDate?: string,
  visibilityFilter?: Array<'PUBLIC' | 'FRIENDS' | 'CLOSE_FRIENDS'>
): Prisma.DayWhereInput {
  const where: Prisma.DayWhereInput = { userId: targetUserId }

  if (startDate && endDate) {
    where.date = { gte: startDate, lte: endDate }
  }

  if (visibilityFilter && visibilityFilter.length > 0) {
    where.visibility = { in: visibilityFilter }
  }

  return where
}

/**
 * Honest profit: ticker entries carry {listId, taskId, earnings, premium}.
 * (calculateProfitFromTicker reads a `profit` field no writer ever sets.)
 */
export function calculateDayProfit(ticker: unknown[] | null | undefined): number {
  if (!Array.isArray(ticker)) return 0
  let total = 0
  for (const entry of ticker) {
    const item = entry as { earnings?: number | null; premium?: number | null }
    total += (Number(item?.earnings) || 0) + (Number(item?.premium) || 0)
  }
  return total
}

function compactTasks(tasks: AgentDayRecord['tasks']): CompactTask[] {
  if (!Array.isArray(tasks)) return []
  return tasks
    .slice(0, MAX_TASKS_PER_DAY)
    .map((task) => ({
      name: String(task?.name ?? '').slice(0, MAX_TASK_NAME_LENGTH),
      area: task?.area ? String(task.area) : null,
      status: String(task?.status ?? ''),
      ...(typeof task?.count === 'number' ? { count: task.count } : {}),
      ...(typeof task?.times === 'number' ? { times: task.times } : {})
    }))
    .filter((task) => task.name.length > 0)
}

/**
 * Trim a raw Day row to only the selected dimensions (null when the day has no date).
 */
export function compactDay(day: AgentDayRecord, dims: AgentDimension[]): CompactDay | null {
  if (!day.date) return null

  const compact: CompactDay = {
    date: day.date,
    week: day.week ?? null,
    month: day.month ?? null,
    tasks: compactTasks(day.tasks)
  }

  if (dims.includes('moodAverage')) {
    compact.average = typeof day.average === 'number' ? day.average : null
  }

  const selectedMoodKeys = MOOD_DIMENSIONS.filter((key) => dims.includes(key))
  if (selectedMoodKeys.length > 0 && day.mood) {
    const mood: Partial<Record<MoodKey, number>> = {}
    for (const key of selectedMoodKeys) {
      const value = day.mood[key]
      if (typeof value === 'number') mood[key] = value
    }
    compact.mood = mood
  }

  if (dims.includes('progress')) {
    compact.progress = typeof day.progress === 'number' ? day.progress : null
  }
  if (dims.includes('profit')) {
    compact.profit = calculateDayProfit(day.ticker)
  }
  if (dims.includes('stash')) {
    compact.stash = typeof day.stash === 'number' ? day.stash : null
  }
  if (dims.includes('withdrawn')) {
    compact.withdrawn = typeof day.withdrawn === 'number' ? day.withdrawn : null
  }
  if (dims.includes('balance')) {
    compact.balance = typeof day.balance === 'number' ? day.balance : null
  }

  return compact
}

/** Single-line serialization of a compact day for chunk text */
export function dayChunkText(day: CompactDay): string {
  const parts: string[] = []
  let dateLabel = day.date
  if (day.week) dateLabel += ` (w${day.week})`
  parts.push(dateLabel)

  if (day.mood && Object.keys(day.mood).length > 0) {
    parts.push(`mood: ${Object.entries(day.mood).map(([key, value]) => `${key}=${value}`).join(', ')}`)
  }
  if (typeof day.average === 'number') parts.push(`average: ${day.average}`)
  if (typeof day.progress === 'number') parts.push(`progress: ${day.progress}%`)
  if (typeof day.profit === 'number') parts.push(`profit: ${day.profit}`)
  if (typeof day.stash === 'number') parts.push(`stash: ${day.stash}`)
  if (typeof day.withdrawn === 'number') parts.push(`withdrawn: ${day.withdrawn}`)
  if (typeof day.balance === 'number') parts.push(`balance: ${day.balance}`)

  if (day.tasks.length > 0) {
    const taskParts = day.tasks.map((task) => {
      if (task.count != null || task.times != null) {
        return `${task.name} ${task.count ?? 0}/${task.times ?? '?'}`
      }
      return task.name
    })
    parts.push(`tasks: ${taskParts.join('; ')}`)
  }

  return parts.join(' | ')
}
