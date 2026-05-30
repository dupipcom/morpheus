/**
 * Utility helper functions for TaskList operations
 * These are pure functions with no database dependencies
 */

import { randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import { parseCookies } from '@/lib/utils/localeUtils'
import { getBestLocale, loadTranslationsSync, t } from '@/lib/i18n'
import type { Task, UserBalanceValues, TASK_ALLOWED_KEYS } from './types'

/**
 * Generate a unique MongoDB ObjectId (24-character hex string)
 */
export function generateObjectId(): string {
  return randomBytes(12).toString('hex')
}

/**
 * Ensure all tasks have unique ObjectIds
 * When copying from template, always generate new IDs to ensure uniqueness
 */
export function ensureUniqueTaskIds(tasks: Task[], fromTemplate: boolean = false): Task[] {
  return tasks.map((task) => ({
    ...task,
    id: fromTemplate ? generateObjectId() : (task.id || generateObjectId())
  }))
}

/**
 * Get user's locale from request headers/cookies
 */
export function getUserLocale(request: NextRequest): string {
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = parseCookies(cookieHeader)

  // First check for user preference cookie
  const userLocale = cookies['dpip_user_locale']
  if (userLocale) {
    return userLocale
  }

  // Fall back to browser locale
  const acceptLanguage = request.headers.get('accept-language') || ''
  return getBestLocale(acceptLanguage)
}

/**
 * Translate template tasks using localeKey
 */
export function translateTemplateTasks(tasks: Task[], translations: Record<string, unknown>): Task[] {
  return tasks.map((task) => {
    if (task.localeKey && translations) {
      const translatedName = t(translations, `actions.${task.localeKey}`)
      return {
        ...task,
        name: translatedName || task.name
      }
    }
    return task
  })
}

/**
 * Get task key for matching (id, localeKey, or lowercase name)
 */
export function getTaskKey(task: Task | null | undefined): string {
  if (!task) return ''
  return (task.id || task.localeKey || (typeof task.name === 'string' ? task.name.toLowerCase() : '')) as string
}

/**
 * Parse a number value that might be string or number
 */
export function parseNumericValue(value: number | string | null | undefined, defaultValue: number = 0): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return parseFloat(value)
  return defaultValue
}

/**
 * Parse budget value from various input types
 */
export function parseBudget(budgetRaw: number | string | undefined): number | undefined {
  if (typeof budgetRaw === 'number') return budgetRaw
  if (typeof budgetRaw === 'string' && budgetRaw.trim() !== '') return parseFloat(budgetRaw)
  return undefined
}

/**
 * Get user balance values from user object
 */
export function getUserBalanceValues(user: {
  availableBalance?: number | string | null
  stash?: number | string | null
  equity?: number | string | null
}): UserBalanceValues {
  return {
    userBalance: parseNumericValue(user.availableBalance),
    userStash: parseNumericValue(user.stash),
    userEquity: parseNumericValue(user.equity)
  }
}

/**
 * Sanitize task to only include allowed keys
 */
export function sanitizeTask(task: Record<string, unknown>): Task {
  const allowedKeys = new Set<string>([
    'id', 'name', 'categories', 'area', 'status', 'cadence', 'times', 'count',
    'localeKey', 'contacts', 'things', 'favorite', 'isEphemeral', 'createdAt',
    'completers', 'redacted'
  ])

  const out: Record<string, unknown> = {}
  for (const k in task) {
    if (allowedKeys.has(k)) {
      out[k] = task[k]
    }
  }
  return out as Task
}

/**
 * Format date as YYYY-MM-DD for completedOn
 */
export function formatDateForCompletedOn(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 */
export function getTodayISO(): string {
  return formatDateForCompletedOn(new Date())
}

/**
 * Extract year from ISO date string
 */
export function getYearFromISO(dateISO: string): number {
  return Number(dateISO.split('-')[0])
}

/**
 * Get localized name for default task lists
 */
export function getLocalizedListName(
  role: string,
  translations: Record<string, unknown>,
  fallbackName?: string
): string {
  if (role === 'daily.default') {
    return t(translations, 'common.daily')
  }
  if (role === 'weekly.default') {
    return t(translations, 'common.weekly')
  }
  return fallbackName || 'Default'
}

/**
 * Load translations for a locale synchronously
 */
export function loadTranslationsForLocale(locale: string): Record<string, unknown> {
  return loadTranslationsSync(locale)
}

/**
 * Check if a task status represents completion
 */
export function isCompletedStatus(status: string | undefined): boolean {
  return status === 'done'
}

/**
 * Check if a task is considered done based on status or count
 */
export function isTaskDone(task: Task): boolean {
  if (task.status === 'done') return true
  const count = task.count || 0
  const times = task.times || 1
  return count >= times
}

/**
 * Check if status should exclude task from day.tasks
 */
export function shouldExcludeFromDayTasks(status: string | undefined): boolean {
  return status === 'open' || status === 'ignored'
}

/**
 * Build a task object for Day.tasks
 */
export function buildTaskForDay(incomingTask: Task, status?: string): Task {
  const taskStatus = status || incomingTask.status || 'open'
  return {
    id: incomingTask.id || undefined,
    name: incomingTask.name,
    categories: incomingTask.categories || [],
    area: incomingTask.area || 'self',
    status: taskStatus,
    cadence: incomingTask.cadence || 'daily',
    times: incomingTask.times || 1,
    count: incomingTask.count || 0,
    localeKey: incomingTask.localeKey || undefined,
    persons: incomingTask.persons || [],
    things: incomingTask.things || [],
    events: incomingTask.events || [],
    notes: incomingTask.notes || [],
    documents: incomingTask.documents || [],
    favorite: incomingTask.favorite || false,
    isEphemeral: incomingTask.isEphemeral || false,
    createdAt: incomingTask.createdAt || undefined,
    completedOn: incomingTask.completedOn || undefined,
    completers: incomingTask.completers || [],
    dueDate: incomingTask.dueDate || undefined,
    budget: incomingTask.budget || undefined,
    visibility: incomingTask.visibility || undefined,
    quality: incomingTask.quality || undefined
  }
}

/**
 * Create a task matcher function for finding tasks by id or key
 */
export function createTaskMatcher(taskId?: string, taskKey?: string): (task: Task) => boolean {
  return (task: Task) => {
    if (taskId && (task.id === taskId || task.localeKey === taskId)) {
      return true
    }
    if (taskKey) {
      const key = getTaskKey(task)
      const taskKeyLower = typeof taskKey === 'string' ? taskKey.toLowerCase() : taskKey
      return key === taskKeyLower || key === taskKey
    }
    return false
  }
}

/**
 * Determine list role type
 */
export function getListRoleType(role: string | null | undefined): {
  isDaily: boolean
  isWeekly: boolean
  isOneOff: boolean
} {
  const rolePrefix = role?.split('.')[0] || ''
  return {
    isDaily: rolePrefix === 'daily',
    isWeekly: rolePrefix === 'weekly',
    isOneOff: rolePrefix === 'one-off' || rolePrefix === 'oneoff'
  }
}
