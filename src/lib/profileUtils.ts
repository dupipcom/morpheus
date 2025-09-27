import { getWeekNumber } from "@/app/helpers"

export interface PublicChartsData {
  moodCharts?: {
    weeksData: Array<{
      week: number
      moodAverage: number
      gratitude: number
      optimism: number
      restedness: number
      tolerance: number
      selfEsteem: number
      trust: number
    }>
  }
  productivityCharts?: {
    weeksData: Array<{
      week: number
      progress: number
      moodAverage: number
    }>
  }
  earningsCharts?: {
    weeksData: Array<{
      week: number
      earnings: number
      balance: number
      moodAverage: number
    }>
  }
}

export interface ChartVisibility {
  moodCharts: boolean
  productivityCharts: boolean
  earningsCharts: boolean
}

/**
 * Processes user entries data to create public charts data based on visibility settings
 * @param userEntries - The user's entries data from the database
 * @param visibilitySettings - Which charts should be visible
 * @returns Processed public charts data
 */
export function generatePublicChartsData(
  userEntries: any,
  visibilitySettings: ChartVisibility
): PublicChartsData {
  if (!userEntries) {
    return {}
  }

  const currentYear = new Date().getFullYear()
  const yearData = userEntries[currentYear]
  
  if (!yearData?.weeks) {
    return {}
  }

  const weeks = Object.values(yearData.weeks) as any[]
  const days = yearData.days || {}
  
  const weeksData = weeks
    .filter(week => week && typeof week === 'object')
    .map(week => {
      // Calculate mood average from daily data
      let moodAverage = 0
      let gratitude = 0
      let optimism = 0
      let restedness = 0
      let tolerance = 0
      let selfEsteem = 0
      let trust = 0
      
      // Get days for this week from the separate days object
      const weekDays = Object.values(days).filter((day: any) => day.week === week.week)
      
      if (weekDays && weekDays.length > 0) {
        const daysWithMood = weekDays.filter((day: any) => day.mood)
        
        if (daysWithMood.length > 0) {
          gratitude = daysWithMood.reduce((sum: number, day: any) => sum + (day.mood.gratitude || 0), 0) / daysWithMood.length
          optimism = daysWithMood.reduce((sum: number, day: any) => sum + (day.mood.optimism || 0), 0) / daysWithMood.length
          restedness = daysWithMood.reduce((sum: number, day: any) => sum + (day.mood.restedness || 0), 0) / daysWithMood.length
          tolerance = daysWithMood.reduce((sum: number, day: any) => sum + (day.mood.tolerance || 0), 0) / daysWithMood.length
          selfEsteem = daysWithMood.reduce((sum: number, day: any) => sum + (day.mood.selfEsteem || 0), 0) / daysWithMood.length
          trust = daysWithMood.reduce((sum: number, day: any) => sum + (day.mood.trust || 0), 0) / daysWithMood.length
          
          moodAverage = (gratitude + optimism + restedness + tolerance + selfEsteem + trust) / 6
        }
      }

      // Calculate progress from tasks
      const totalTasks = week.tasks?.length || 0
      const completedTasks = week.tasks?.filter((task: any) => task.status === 'Done').length || 0
      const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

      // Calculate earnings and balance
      const earnings = parseFloat(week.earnings) || 0
      const balance = parseFloat(week.availableBalance) || 0

      return {
        week: week.week,
        moodAverage: Math.round(moodAverage * 10) / 10,
        gratitude: Math.round(gratitude * 10) / 10,
        optimism: Math.round(optimism * 10) / 10,
        restedness: Math.round(restedness * 10) / 10,
        tolerance: Math.round(tolerance * 10) / 10,
        selfEsteem: Math.round(selfEsteem * 10) / 10,
        trust: Math.round(trust * 10) / 10,
        progress: Math.round(progress * 10) / 10,
        earnings: Math.round(earnings * 100) / 100,
        balance: Math.round(balance * 100) / 100
      }
    })
    .sort((a, b) => a.week - b.week)

  // Scale values to percentages for privacy
  const scaleToPercentage = (values: number[], maxValue: number = 100) => {
    if (values.length === 0) return values
    const max = Math.max(...values)
    if (max === 0) return values
    return values.map(value => Math.round((value / max) * maxValue * 10) / 10)
  }

  // Get arrays for scaling
  const moodAverages = weeksData.map(w => w.moodAverage)
  const gratitudes = weeksData.map(w => w.gratitude)
  const optimisms = weeksData.map(w => w.optimism)
  const restednesses = weeksData.map(w => w.restedness)
  const tolerances = weeksData.map(w => w.tolerance)
  const selfEsteems = weeksData.map(w => w.selfEsteem)
  const trusts = weeksData.map(w => w.trust)
  const earnings = weeksData.map(w => w.earnings)
  const balances = weeksData.map(w => w.balance)

  // Scale the data (all mood dimensions as percentage for privacy)
  const scaledMoodAverages = scaleToPercentage(moodAverages, 100)
  const scaledGratitudes = scaleToPercentage(gratitudes, 100)
  const scaledOptimisms = scaleToPercentage(optimisms, 100)
  const scaledRestednesses = scaleToPercentage(restednesses, 100)
  const scaledTolerances = scaleToPercentage(tolerances, 100)
  const scaledSelfEsteems = scaleToPercentage(selfEsteems, 100)
  const scaledTrusts = scaleToPercentage(trusts, 100)
  const scaledEarnings = scaleToPercentage(earnings, 100)
  const scaledBalances = scaleToPercentage(balances, 100)

  // Update weeksData with scaled values
  weeksData.forEach((week, index) => {
    week.moodAverage = scaledMoodAverages[index]
    week.gratitude = scaledGratitudes[index]
    week.optimism = scaledOptimisms[index]
    week.restedness = scaledRestednesses[index]
    week.tolerance = scaledTolerances[index]
    week.selfEsteem = scaledSelfEsteems[index]
    week.trust = scaledTrusts[index]
    week.earnings = scaledEarnings[index]
    week.balance = scaledBalances[index]
  })

  const result: PublicChartsData = {}

  if (visibilitySettings.moodCharts) {
    result.moodCharts = {
      weeksData: weeksData.map(week => ({
        week: week.week,
        moodAverage: week.moodAverage,
        gratitude: week.gratitude,
        optimism: week.optimism,
        restedness: week.restedness,
        tolerance: week.tolerance,
        selfEsteem: week.selfEsteem,
        trust: week.trust
      }))
    }
  }

  if (visibilitySettings.productivityCharts) {
    result.productivityCharts = {
      weeksData: weeksData.map(week => ({
        week: week.week,
        progress: week.progress,
        moodAverage: week.moodAverage
      }))
    }
  }

  if (visibilitySettings.earningsCharts) {
    result.earningsCharts = {
      weeksData: weeksData.map(week => ({
        week: week.week,
        earnings: week.earnings,
        balance: week.balance,
        moodAverage: week.moodAverage
      }))
    }
  }

  return result
}

/**
 * Removes sensitive data from user entries based on publicCharts visibility settings
 * @param userEntries - The user's entries data
 * @param publicChartsSettings - The publicCharts visibility settings
 * @returns Sanitized entries data
 */
export function sanitizeUserEntriesForPublic(
  userEntries: any,
  publicChartsSettings: any
): any {
  if (!userEntries || !publicChartsSettings) return {}

  const sanitized = { ...userEntries }
  
  // Remove all sensitive data and keep only what's needed for public charts
  Object.keys(sanitized).forEach(year => {
    if (sanitized[year]?.weeks) {
      Object.keys(sanitized[year].weeks).forEach(weekKey => {
        const week = sanitized[year].weeks[weekKey]
        
        // Keep only the data needed for public charts
        const sanitizedWeek: any = {
          week: week.week,
          year: week.year
        }

        // Add mood data only if mood charts are public
        if (publicChartsSettings.moodCharts && week.days) {
          sanitizedWeek.days = week.days.map((day: any) => ({
            date: day.date,
            mood: day.mood ? {
              gratitude: day.mood.gratitude,
              optimism: day.mood.optimism,
              restedness: day.mood.restedness,
              tolerance: day.mood.tolerance,
              selfEsteem: day.mood.selfEsteem,
              trust: day.mood.trust
            } : null
          }))
        }

        // Add task data only if productivity charts are public
        if (publicChartsSettings.productivityCharts) {
          sanitizedWeek.tasks = week.tasks?.map((task: any) => ({
            name: task.name,
            status: task.status,
            count: task.count,
            times: task.times
          })) || []
        }

        // Add earnings data only if earnings charts are public
        if (publicChartsSettings.earningsCharts) {
          sanitizedWeek.earnings = week.earnings
        }

        sanitized[year].weeks[weekKey] = sanitizedWeek
      })
    }
  })

  return sanitized
}
