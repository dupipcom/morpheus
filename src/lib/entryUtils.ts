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
  const capDays = 60
  for (let back = 1; back <= capDays; back++) {
    const pastDate = new Date(currentDateObj)
    pastDate.setDate(pastDate.getDate() - back)
    const pastDateString = pastDate.toISOString().split('T')[0]
    const y = pastDate.getFullYear()
    const pastDay = entries?.[y]?.days?.[pastDateString]
    const pastEarnings = parseFloat(pastDay?.earnings) || 0
    if (pastDay && pastEarnings !== 0) {
      return {
        earnings: pastEarnings,
        availableBalance: parseFloat(pastDay.availableBalance) || 0
      }
    }
  }
  return { earnings: 0, availableBalance: 0 }
}

/**
 * Gets the previous week's earnings and availableBalance for ticker calculation
 */
export function getPreviousWeekData(entries: any, year: number, currentWeek: number): { earnings: number, availableBalance: number } {
  let y = year
  let w = currentWeek - 1
  const capWeeks = 104
  for (let i = 0; i < capWeeks; i++) {
    if (w <= 0) {
      y -= 1
      w = 52 + w
    }
    const pastWeekData = entries?.[y]?.weeks?.[w]
    const pastEarnings = parseFloat(pastWeekData?.earnings) || 0
    if (pastWeekData && pastEarnings !== 0) {
      return {
        earnings: pastEarnings,
        availableBalance: parseFloat(pastWeekData.availableBalance) || 0
      }
    }
    w -= 1
  }
  return { earnings: 0, availableBalance: 0 }
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

/**
 * Helpers to compute historical deltas used for multi-horizon tickers
 */
function getDaysAgoData(entries: any, year: number, currentDate: string, daysAgo: number): { earnings: number, availableBalance: number } {
  const currentDateObj = new Date(currentDate)
  const capDays = Math.max(daysAgo + 30, 60)
  for (let back = daysAgo; back <= capDays; back++) {
    const pastDate = new Date(currentDateObj)
    pastDate.setDate(pastDate.getDate() - back)
    const pastDateString = pastDate.toISOString().split('T')[0]
    const y = pastDate.getFullYear()
    const pastDay = entries?.[y]?.days?.[pastDateString]
    const pastEarnings = parseFloat(pastDay?.earnings) || 0
    if (pastDay && pastEarnings !== 0) {
      return {
        earnings: pastEarnings,
        availableBalance: parseFloat(pastDay.availableBalance) || 0
      }
    }
  }
  return { earnings: 0, availableBalance: 0 }
}

function getWeeksAgoData(entries: any, year: number, currentWeek: number, weeksAgo: number): { earnings: number, availableBalance: number } {
  let targetYear = year
  let targetWeek = currentWeek - weeksAgo
  const capWeeks = weeksAgo + 78
  for (let i = 0; i <= capWeeks; i++) {
    if (targetWeek <= 0) {
      targetYear -= 1
      targetWeek = 52 + targetWeek
    }
    const pastWeekData = entries?.[targetYear]?.weeks?.[targetWeek]
    const pastEarnings = parseFloat(pastWeekData?.earnings) || 0
    if (pastWeekData && pastEarnings !== 0) {
      return {
        earnings: pastEarnings,
        availableBalance: parseFloat(pastWeekData.availableBalance) || 0
      }
    }
    targetWeek -= 1
  }
  return { earnings: 0, availableBalance: 0 }
}

/**
 * Calculates all day tickers (1d, 3d) relative to historical ratios.
 * Returns an object with the requested horizons.
 */
export function calculateDayTickers(
  entries: any,
  year: number,
  date: string,
  currentEarnings: number,
  currentAvailableBalance: number
): Record<string, number> {
  const currentRatio = currentEarnings / (currentAvailableBalance || 1)
  const d1 = getPreviousDayData(entries, year, date)
  const r1 = d1.earnings / (d1.availableBalance || 1)
  const v1 = calculatePercentageDelta(currentRatio, r1)

  const d3 = getDaysAgoData(entries, year, date, 3)
  const r3 = d3.earnings / (d3.availableBalance || 1)
  const v3 = calculatePercentageDelta(currentRatio, r3)

  return {
    '1d': isNaN(v1) ? 0 : v1,
    '3d': isNaN(v3) ? 0 : v3,
  }
}

/**
 * Calculates all week tickers (1w, 2w, 4w, 12w, 24w, 36w, 52w) relative to historical ratios.
 * Returns an object with the requested horizons.
 */
export function calculateWeekTickers(
  entries: any,
  year: number,
  week: number,
  currentEarnings: number,
  currentAvailableBalance: number,
  currentDate: string,
  overrideDay?: { dateISO: string, earnings: number, availableBalance: number }
): Record<string, number> {
  const currentRatio = currentEarnings / (currentAvailableBalance || 1)

  const compute = (weeksAgo: number) => {
    const w = weeksAgo === 1 ? getPreviousWeekData(entries, year, week) : getWeeksAgoData(entries, year, week, weeksAgo)
    const r = w.earnings / (w.availableBalance || 1)
    const v = calculatePercentageDelta(currentRatio, r)
    return isNaN(v) ? 0 : v
  }

  // Average daily ratio helpers: compare current window vs previous equal-length window
  const averageDailyRatioForWindow = (endDateISO: string, windowDays: number): number => {
    const end = new Date(endDateISO)
    let sumRatios = 0
    let countedDays = 0
    for (let i = 0; i < windowDays; i++) {
      const past = new Date(end)
      past.setDate(past.getDate() - i)
      const y = past.getFullYear()
      const dayKey = past.toISOString().split('T')[0]
      // If override matches this day, use override values
      const dayData = (overrideDay && overrideDay.dateISO === dayKey)
        ? { earnings: overrideDay.earnings, availableBalance: overrideDay.availableBalance }
        : entries?.[y]?.days?.[dayKey]
      if (!dayData) continue
      const earnings = parseFloat((dayData as any).earnings) || 0
      const avail = parseFloat((dayData as any).availableBalance) || 0
      const ratio = earnings / (avail || 1)
      sumRatios += ratio
      countedDays += 1
    }
    return countedDays > 0 ? (sumRatios / countedDays) : 0
  }

  const computeDayWindowDelta = (windowDays: number): number => {
    const currentAvg = averageDailyRatioForWindow(currentDate, windowDays)
    const prevEnd = new Date(currentDate)
    prevEnd.setDate(prevEnd.getDate() - windowDays)
    const prevEndISO = prevEnd.toISOString().split('T')[0]
    const prevAvg = averageDailyRatioForWindow(prevEndISO, windowDays)
    return calculatePercentageDelta(currentAvg, prevAvg)
  }

  const computeBlend = (windowDays: number, weekDelta: number) => {
    const dayDelta = computeDayWindowDelta(windowDays)
    const validWeek = isFinite(weekDelta)
    const validDay = isFinite(dayDelta)
    if (validWeek && validDay) return (weekDelta + dayDelta) / 2
    if (validWeek) return weekDelta
    if (validDay) return dayDelta
    return 0
  }

  return {
    // Blend week-based delta with day-window delta over the same timeframe
    '1w': computeBlend(7, compute(1)),
    '2w': computeBlend(14, compute(2)),
    '4w': computeBlend(30, compute(4)),      // 1M ≈ 30d
    '12w': computeBlend(84, compute(12)),    // 1Q ≈ 12w
    '24w': computeBlend(168, compute(24)),
    '26w': computeBlend(182, compute(26)),   // 6M ≈ 182d
    '36w': computeBlend(252, compute(36)),
    '52w': computeBlend(365, compute(52)),   // 1Y ≈ 365d
  }
}