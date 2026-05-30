import { getWeekNumber } from '@/app/helpers'

export interface HistoricalDayRecord {
  date: string | null
  week: number | null
  tasks: unknown
  mood: unknown
  ticker: unknown
  average: number | null
  progress: number | null
  balance: number | null
  stash: number | null
  withdrawn: number | null
  analysis: unknown
  productivity: unknown
}

export interface HistoricalWeekRecord {
  weekNumber: number
  days: HistoricalDayRecord[]
}

export interface HistoricalYearRecord {
  days: Record<string, HistoricalDayRecord>
  weeks: Record<string, HistoricalWeekRecord>
}

export type HistoricalEntries = Record<string, HistoricalYearRecord>

export function buildHistoricalEntriesByYear(days: HistoricalDayRecord[]): HistoricalEntries {
  return days.reduce<HistoricalEntries>((entries, day) => {
    if (!day.date) {
      return entries
    }

    const yearKey = day.date.split('-')[0]
    const weekNumber = day.week ?? getWeekNumber(new Date(day.date))[1]
    const weekKey = String(weekNumber)
    const yearEntry = entries[yearKey] || { days: {}, weeks: {} }
    const weekEntry = yearEntry.weeks[weekKey] || { weekNumber, days: [] }

    yearEntry.days[day.date] = day
    yearEntry.weeks[weekKey] = {
      ...weekEntry,
      days: [...weekEntry.days, day]
    }

    entries[yearKey] = yearEntry
    return entries
  }, {})
}