/**
 * Day Service Types
 * Shared types for day-related operations
 */

export const MOOD_KEYS = ['gratitude', 'optimism', 'restedness', 'tolerance', 'selfEsteem', 'trust'] as const

export type MoodKey = typeof MOOD_KEYS[number]

export interface Mood {
  gratitude: number
  optimism: number
  restedness: number
  tolerance: number
  selfEsteem: number
  trust: number
}

export interface QualityMapping {
  personQualities: Record<string, number>
  thingQualities: Record<string, number>
  eventQualities: Record<string, number>
}

export interface DatePeriods {
  week: number
  month: number
  quarter: number
  semester: number
}

export interface DayAnalytics {
  id: string
  date: string
  year: number
  week: number
  month: number
  quarter: number | null
  semester: number | null
  mood: Mood
  moodAverage: number
  profit: number
  progress: number
  availableBalance: number
  stash: number
  withdrawn: number
  ticker: unknown[]
  analysis: Record<string, unknown>
}

export interface EntityWithQuality {
  id: string
  name: string
  quality: number
}

export interface SingleDayResponse {
  id: string
  date: string
  mood: Mood
  contacts: EntityWithQuality[]
  things: EntityWithQuality[]
  lifeEvents: EntityWithQuality[]
  ticker: unknown[]
}

export interface DayRecord {
  id: string
  date: string | null
  week: number | null
  month: number | null
  quarter: number | null
  semester: number | null
  mood: Partial<Mood> | null
  ticker: unknown[] | null
  analysis: Record<string, unknown> | null
  average: number | null
  progress: number | null
  balance: number | null
  stash: number | null
  withdrawn: number | null
  createdAt: Date
  updatedAt: Date
}

export interface DayWithRelations {
  id: string
  date: string
  mood: Partial<Mood> | null
  personIds: string[]
  thingIds: string[]
  eventIds: string[]
  analysis: Record<string, unknown> | null
  ticker: unknown[] | null
}
