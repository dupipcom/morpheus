/**
 * Utility functions for safely updating database entries
 */

/**
 * Safely updates a week entry without losing existing data
 */
export function safeUpdateWeekEntry(
  currentEntries: any,
  year: number,
  week: number,
  updates: any
): any {
  // Ensure the structure exists
  const currentYearData = currentEntries[year] || {}
  const currentWeeksData = currentYearData.weeks || {}
  const currentWeekData = currentWeeksData[week] || {}
  
  return {
    ...currentEntries,
    [year]: {
      ...currentYearData,
      weeks: {
        ...currentWeeksData,
        [week]: {
          ...currentWeekData,
          ...updates
        }
      }
    }
  }
}

/**
 * Safely updates a day entry without losing existing data
 */
export function safeUpdateDayEntry(
  currentEntries: any,
  year: number,
  date: string,
  updates: any
): any {
  // Ensure the structure exists
  const currentYearData = currentEntries[year] || {}
  const currentDaysData = currentYearData.days || {}
  const currentDayData = currentDaysData[date] || {}
  
  return {
    ...currentEntries,
    [year]: {
      ...currentYearData,
      days: {
        ...currentDaysData,
        [date]: {
          ...currentDayData,
          ...updates
        }
      }
    }
  }
}

/**
 * Validates that week data exists and is not empty
 */
export function validateWeekData(entries: any, year: number, week: number): boolean {
  const weekData = entries?.[year]?.weeks?.[week]
  return weekData && Object.keys(weekData).length > 0
}

/**
 * Validates that day data exists and is not empty
 */
export function validateDayData(entries: any, year: number, date: string): boolean {
  const dayData = entries?.[year]?.days?.[date]
  return dayData && Object.keys(dayData).length > 0
}

/**
 * Logs entry data for debugging purposes
 */
export function logEntryData(entries: any, year: number, week?: number, date?: string) {
  if (process.env.NODE_ENV === 'development') {
    console.log('Entry data validation:', {
      year,
      week,
      date,
      yearExists: !!entries?.[year],
      weekExists: week ? !!entries?.[year]?.weeks?.[week] : undefined,
      dayExists: date ? !!entries?.[year]?.days?.[date] : undefined,
      weekData: week ? entries?.[year]?.weeks?.[week] : undefined,
      dayData: date ? entries?.[year]?.days?.[date] : undefined
    })
  }
}

/**
 * Ensures week data has all required fields before closing
 */
export function ensureWeekDataIntegrity(weekData: any, year: number, week: number): any {
  const defaultWeekData = {
    year,
    week,
    tasks: [],
    ephemeralTasks: [],
    status: "Open",
    earnings: "0",
    ticker: 0,
    progress: 0,
    done: 0,
    tasksNumber: 0,
    availableBalance: "0",
    contacts: []
  }
  
  return {
    ...defaultWeekData,
    ...weekData
  }
}

/**
 * Ensures day data has all required fields before closing
 */
export function ensureDayDataIntegrity(dayData: any, year: number, date: string, weekNumber: number): any {
  const defaultDayData = {
    year,
    week: weekNumber,
    date,
    tasks: [],
    ephemeralTasks: [],
    status: "Open",
    moodAverage: 0,
    mood: {
      gratitude: 0,
      optimism: 0,
      restedness: 0,
      tolerance: 0,
      selfEsteem: 0,
      trust: 0,
    },
    earnings: "0",
    ticker: 0,
    availableBalance: "0",
    contacts: []
  }
  
  return {
    ...defaultDayData,
    ...dayData
  }
}

/**
 * Adds an ephemeral task to a day entry
 */
export function addEphemeralTaskToDay(
  currentEntries: any,
  year: number,
  date: string,
  ephemeralTask: any
): any {
  const currentDayData = currentEntries?.[year]?.days?.[date] || {}
  const currentEphemeralTasks = currentDayData.ephemeralTasks || []
  
  return safeUpdateDayEntry(currentEntries, year, date, {
    ephemeralTasks: [...currentEphemeralTasks, ephemeralTask]
  })
}

/**
 * Adds an ephemeral task to a week entry
 */
export function addEphemeralTaskToWeek(
  currentEntries: any,
  year: number,
  week: number,
  ephemeralTask: any
): any {
  const currentWeekData = currentEntries?.[year]?.weeks?.[week] || {}
  const currentEphemeralTasks = currentWeekData.ephemeralTasks || []
  
  return safeUpdateWeekEntry(currentEntries, year, week, {
    ephemeralTasks: [...currentEphemeralTasks, ephemeralTask]
  })
}

/**
 * Updates an ephemeral task in a day entry
 */
export function updateEphemeralTaskInDay(
  currentEntries: any,
  year: number,
  date: string,
  taskId: string,
  updates: any
): any {
  const currentDayData = currentEntries?.[year]?.days?.[date] || {}
  const currentEphemeralTasks = currentDayData.ephemeralTasks || []
  
  const updatedEphemeralTasks = currentEphemeralTasks.map((task: any) => 
    task.id === taskId ? { ...task, ...updates } : task
  )
  
  return safeUpdateDayEntry(currentEntries, year, date, {
    ephemeralTasks: updatedEphemeralTasks
  })
}

/**
 * Updates an ephemeral task in a week entry
 */
export function updateEphemeralTaskInWeek(
  currentEntries: any,
  year: number,
  week: number,
  taskId: string,
  updates: any
): any {
  const currentWeekData = currentEntries?.[year]?.weeks?.[week] || {}
  const currentEphemeralTasks = currentWeekData.ephemeralTasks || []
  
  const updatedEphemeralTasks = currentEphemeralTasks.map((task: any) => 
    task.id === taskId ? { ...task, ...updates } : task
  )
  
  return safeUpdateWeekEntry(currentEntries, year, week, {
    ephemeralTasks: updatedEphemeralTasks
  })
}

/**
 * Removes an ephemeral task from a day entry
 */
export function removeEphemeralTaskFromDay(
  currentEntries: any,
  year: number,
  date: string,
  taskId: string
): any {
  const currentDayData = currentEntries?.[year]?.days?.[date] || {}
  const currentEphemeralTasks = currentDayData.ephemeralTasks || []
  
  const updatedEphemeralTasks = currentEphemeralTasks.filter((task: any) => task.id !== taskId)
  
  return safeUpdateDayEntry(currentEntries, year, date, {
    ephemeralTasks: updatedEphemeralTasks
  })
}

/**
 * Removes an ephemeral task from a week entry
 */
export function removeEphemeralTaskFromWeek(
  currentEntries: any,
  year: number,
  week: number,
  taskId: string
): any {
  const currentWeekData = currentEntries?.[year]?.weeks?.[week] || {}
  const currentEphemeralTasks = currentWeekData.ephemeralTasks || []
  
  const updatedEphemeralTasks = currentEphemeralTasks.filter((task: any) => task.id !== taskId)
  
  return safeUpdateWeekEntry(currentEntries, year, week, {
    ephemeralTasks: updatedEphemeralTasks
  })
}

/**
 * Calculates the percentage delta between current and previous values
 */
export function calculatePercentageDelta(currentValue: number, previousValue: number): number {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0
  }
  return ((currentValue - previousValue) / previousValue) * 100
}

/**
 * Gets the previous day's earnings and availableBalance for ticker calculation
 */
export function getPreviousDayData(entries: any, year: number, currentDate: string): { earnings: number, availableBalance: number } {
  const currentDateObj = new Date(currentDate)
  const previousDate = new Date(currentDateObj)
  previousDate.setDate(previousDate.getDate() - 1)
  const previousDateString = previousDate.toISOString().split('T')[0]
  
  const previousDay = entries?.[year]?.days?.[previousDateString]
  if (!previousDay) {
    return { earnings: 0, availableBalance: 0 }
  }
  
  return {
    earnings: parseFloat(previousDay.earnings) || 0,
    availableBalance: parseFloat(previousDay.availableBalance) || 0
  }
}

/**
 * Gets the previous week's earnings and availableBalance for ticker calculation
 */
export function getPreviousWeekData(entries: any, year: number, currentWeek: number): { earnings: number, availableBalance: number } {
  const previousWeek = currentWeek === 1 ? 52 : currentWeek - 1
  const previousYear = currentWeek === 1 ? year - 1 : year
  
  const previousWeekData = entries?.[previousYear]?.weeks?.[previousWeek]
  if (!previousWeekData) {
    return { earnings: 0, availableBalance: 0 }
  }
  
  return {
    earnings: parseFloat(previousWeekData.earnings) || 0,
    availableBalance: parseFloat(previousWeekData.availableBalance) || 0
  }
}

/**
 * Calculates ticker value for a day entry
 */
export function calculateDayTicker(entries: any, year: number, date: string, currentEarnings: number, currentAvailableBalance: number): number {
  const previousData = getPreviousDayData(entries, year, date)
  const currentRatio = currentEarnings / (currentAvailableBalance || 1)
  const previousRatio = previousData.earnings / (previousData.availableBalance || 1)
  
  return calculatePercentageDelta(currentRatio, previousRatio)
}

/**
 * Calculates ticker value for a week entry
 */
export function calculateWeekTicker(entries: any, year: number, week: number, currentEarnings: number, currentAvailableBalance: number): number {
  const previousData = getPreviousWeekData(entries, year, week)
  const currentRatio = currentEarnings / (currentAvailableBalance || 1)
  const previousRatio = previousData.earnings / (previousData.availableBalance || 1)
  
  return calculatePercentageDelta(currentRatio, previousRatio)
} 