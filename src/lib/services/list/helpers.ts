/**
 * Utility helper functions for TaskList operations
 * These are pure functions with no database dependencies
 */

import { randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import { parseCookies } from '@/lib/utils/localeUtils'
import { getBestLocale, loadTranslationsSync, t } from '@/lib/i18n'
import type { Task, UserBalanceValues } from './types'

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

