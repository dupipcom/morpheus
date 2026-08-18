/**
 * Day Transform Service
 * Centralized transformation logic for day data
 * Eliminates duplicate transformation code in days/route.ts
 */

import prisma from '@/lib/prisma'
import { getWeekNumber } from '@/app/helpers'
import type {
  Mood,
  MoodKey,
  QualityMapping,
  DatePeriods,
  DayAnalytics,
  EntityWithQuality,
  SingleDayResponse,
  DayRecord,
  DayWithRelations,
  MOOD_KEYS
} from './types'

const MOOD_DIMENSION_KEYS: readonly MoodKey[] = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust']

/**
 * Create a default mood object with all values set to 0
 */
export function createDefaultMood(): Mood {
  return {
    gratitude: 0,
    optimism: 0,
    restedness: 0,
    tolerance: 0,
    selfEsteem: 0,
    trust: 0
  }
}

/**
 * Normalize mood data, ensuring all required fields exist
 */
export function normalizeMood(mood: Partial<Mood> | null | undefined): Mood {
  const defaultMood = createDefaultMood()
  if (!mood) return defaultMood

  return {
    gratitude: Number(mood.gratitude) || 0,
    optimism: Number(mood.optimism) || 0,
    restedness: Number(mood.restedness) || 0,
    tolerance: Number(mood.tolerance) || 0,
    selfEsteem: Number(mood.selfEsteem) || 0,
    trust: Number(mood.trust) || 0
  }
}

/**
 * Calculate mood average from mood values
 */
export function calculateMoodAverage(mood: Partial<Mood> | null | undefined): number {
  const normalized = normalizeMood(mood)
  const values = MOOD_DIMENSION_KEYS.map(key => normalized[key])
  const sum = values.reduce((acc, val) => acc + val, 0)
  return sum / MOOD_DIMENSION_KEYS.length
}

/**
 * Merge mood updates with existing mood data
 * Only updates fields that are explicitly provided in updates
 */
export function mergeMoodUpdates(
  existing: Partial<Mood> | null | undefined,
  updates: Partial<Mood> | null | undefined
): Mood {
  const existingNormalized = normalizeMood(existing)
  if (!updates) return existingNormalized

  return {
    gratitude: updates.gratitude !== undefined ? Number(updates.gratitude) || 0 : existingNormalized.gratitude,
    optimism: updates.optimism !== undefined ? Number(updates.optimism) || 0 : existingNormalized.optimism,
    restedness: updates.restedness !== undefined ? Number(updates.restedness) || 0 : existingNormalized.restedness,
    tolerance: updates.tolerance !== undefined ? Number(updates.tolerance) || 0 : existingNormalized.tolerance,
    selfEsteem: updates.selfEsteem !== undefined ? Number(updates.selfEsteem) || 0 : existingNormalized.selfEsteem,
    trust: updates.trust !== undefined ? Number(updates.trust) || 0 : existingNormalized.trust
  }
}

/**
 * Calculate date periods (week, month, quarter, semester) from a date
 */
export function calculateDatePeriods(date: Date | string): DatePeriods {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const { week: weekNumber } = getWeekNumber(dateObj)
  const month = dateObj.getMonth() + 1
  const quarter = Math.ceil(month / 3)
  const semester = month <= 6 ? 1 : 2

  return {
    week: weekNumber,
    month,
    quarter,
    semester
  }
}

/**
 * Extract quality mappings from contacts, things, and lifeEvents arrays
 */
export function extractQualityMappings(
  contacts: Array<{ id: string; quality?: number } | string> | undefined,
  things: Array<{ id: string; quality?: number } | string> | undefined,
  lifeEvents: Array<{ id: string; quality?: number } | string> | undefined
): QualityMapping {
  const personQualities: Record<string, number> = {}
  const thingQualities: Record<string, number> = {}
  const eventQualities: Record<string, number> = {}

  if (contacts) {
    contacts.forEach((c) => {
      if (typeof c === 'object' && c.id && c.quality !== undefined) {
        personQualities[c.id] = Number(c.quality) || 0
      }
    })
  }

  if (things) {
    things.forEach((t) => {
      if (typeof t === 'object' && t.id && t.quality !== undefined) {
        thingQualities[t.id] = Number(t.quality) || 0
      }
    })
  }

  if (lifeEvents) {
    lifeEvents.forEach((e) => {
      if (typeof e === 'object' && e.id && e.quality !== undefined) {
        eventQualities[e.id] = Number(e.quality) || 0
      }
    })
  }

  return { personQualities, thingQualities, eventQualities }
}

/**
 * Extract IDs from contacts, things, and lifeEvents arrays
 */
export function extractEntityIds(
  items: Array<{ id: string } | string> | undefined
): string[] | undefined {
  if (items === undefined) return undefined
  return items
    .map((item) => (typeof item === 'string' ? item : item.id))
    .filter(Boolean)
}

/**
 * Calculate profit from ticker array
 */
export function calculateProfitFromTicker(ticker: unknown[] | null | undefined): number {
  if (!ticker) return 0
  if (Array.isArray(ticker)) {
    return ticker.reduce((sum: number, t: unknown) => {
      const item = t as { profit?: number }
      return sum + (Number(item?.profit) || 0)
    }, 0)
  }
  if (typeof ticker === 'object' && ticker !== null) {
    const item = ticker as { profit?: number }
    return Number(item?.profit) || 0
  }
  return 0
}

/**
 * Transform a day record for analytics response
 */
export function transformDayForAnalytics(day: DayRecord): DayAnalytics {
  const dayDate = day.date ? new Date(day.date) : new Date(day.createdAt)
  const { week: weekNumber } = getWeekNumber(dayDate)

  const mood = normalizeMood(day.mood)
  const moodAverage = typeof day.average === 'number'
    ? day.average
    : calculateMoodAverage(day.mood)

  const profit = calculateProfitFromTicker(day.ticker)

  return {
    id: day.id,
    date: day.date || dayDate.toISOString().split('T')[0],
    year: dayDate.getFullYear(),
    week: day.week || weekNumber,
    month: day.month || dayDate.getMonth() + 1,
    quarter: day.quarter,
    semester: day.semester,
    mood,
    moodAverage,
    profit: Number(profit) || 0,
    progress: typeof day.progress === 'number' ? day.progress : 0,
    availableBalance: typeof day.balance === 'number' ? day.balance : 0,
    stash: typeof day.stash === 'number' ? day.stash : 0,
    withdrawn: typeof day.withdrawn === 'number' ? day.withdrawn : 0,
    ticker: (day.ticker || []) as unknown[],
    analysis: (day.analysis || {}) as Record<string, unknown>
  }
}

/**
 * Fetch related persons, things, and events for a day
 */
export async function fetchDayRelations(day: DayWithRelations): Promise<{
  persons: Array<{ id: string; name: string }>
  things: Array<{ id: string; name: string }>
  events: Array<{ id: string; name: string }>
}> {
  const [persons, things, events] = await Promise.all([
    day.personIds.length > 0
      ? prisma.person.findMany({
          where: { id: { in: day.personIds } },
          select: { id: true, name: true }
        })
      : [],
    day.thingIds.length > 0
      ? prisma.thing.findMany({
          where: { id: { in: day.thingIds } },
          select: { id: true, name: true }
        })
      : [],
    (day.lifeEventIds || []).length > 0
      ? prisma.lifeEvent.findMany({
          where: { id: { in: day.lifeEventIds } },
          select: { id: true, name: true }
        })
      : []
  ])

  return { persons, things, events }
}

/**
 * Merge entities with their quality values from analysis
 */
export function mergeEntitiesWithQuality(
  entities: Array<{ id: string; name: string }>,
  qualities: Record<string, number>
): EntityWithQuality[] {
  return entities.map((entity) => ({
    ...entity,
    quality: qualities[entity.id] || 0
  }))
}

/**
 * Transform a single day with its relations for response
 */
export async function transformSingleDayResponse(
  day: DayWithRelations
): Promise<SingleDayResponse> {
  const { persons, things, events } = await fetchDayRelations(day)

  const analysis = (day.analysis || {}) as {
    personQualities?: Record<string, number>
    thingQualities?: Record<string, number>
    eventQualities?: Record<string, number>
  }

  return {
    id: day.id,
    date: day.date,
    mood: normalizeMood(day.mood),
    contacts: mergeEntitiesWithQuality(persons, analysis.personQualities || {}),
    things: mergeEntitiesWithQuality(things, analysis.thingQualities || {}),
    lifeEvents: mergeEntitiesWithQuality(events, analysis.eventQualities || {}),
    ticker: (day.ticker || []) as unknown[]
  }
}

/**
 * Parse a numeric value that might be a string or number
 */
export function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseFloat(value) || 0
  return 0
}

/**
 * Build analysis data object from quality mappings
 * Only includes non-empty quality mappings
 */
export function buildAnalysisData(mapping: QualityMapping): Record<string, Record<string, number>> {
  const analysisData: Record<string, Record<string, number>> = {}

  if (Object.keys(mapping.personQualities).length > 0) {
    analysisData.personQualities = mapping.personQualities
  }
  if (Object.keys(mapping.thingQualities).length > 0) {
    analysisData.thingQualities = mapping.thingQualities
  }
  if (Object.keys(mapping.eventQualities).length > 0) {
    analysisData.eventQualities = mapping.eventQualities
  }

  return analysisData
}

/**
 * Parse mood updates from request body
 * Returns undefined if no valid mood fields are provided
 */
export function parseMoodUpdates(mood: Partial<Mood> | null | undefined): Partial<Mood> | undefined {
  if (mood === undefined || mood === null) return undefined

  const updates: Partial<Mood> = {}
  let hasUpdates = false

  MOOD_DIMENSION_KEYS.forEach((key) => {
    if (mood[key] !== undefined) {
      updates[key] = Number(mood[key]) || 0
      hasUpdates = true
    }
  })

  return hasUpdates ? updates : undefined
}
