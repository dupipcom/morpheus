import { useState, useEffect, useContext } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { GlobalContext } from '@/lib/contexts'

interface TickerData {
  dailyTicker: number
  weeklyTicker: number
  threeDayTicker: number
  twoWeekTicker: number
  fourWeekTicker: number
  twelveWeekTicker: number
  twentySixWeekTicker: number
  fiftyTwoWeekTicker: number
  dailyEarnings: string
  weeklyEarnings: string
  availableBalance: string
}

// Helper function to calculate ticker for a specific number of days ago
function calculateDaysAgoTicker(entries: any, year: number, currentDate: string, daysAgo: number, currentEarnings: number, currentAvailableBalance: number): number {
  try {
    const currentDateObj = new Date(currentDate)
    const pastDate = new Date(currentDateObj)
    pastDate.setDate(pastDate.getDate() - daysAgo)
    const pastDateString = pastDate.toISOString().split('T')[0]
    
    const pastDay = entries?.[year]?.days?.[pastDateString]
    if (!pastDay) {
      return 0
    }
    
    const currentRatio = currentEarnings / (currentAvailableBalance || 1)
    const pastRatio = (parseFloat(pastDay.earnings) || 0) / (parseFloat(pastDay.availableBalance) || 1)
    
    if (pastRatio === 0) {
      return currentRatio > 0 ? 100 : 0
    }
    
    const result = ((currentRatio - pastRatio) / pastRatio) * 100
    return isNaN(result) ? 0 : result
  } catch (error) {
    console.warn(`Error calculating ${daysAgo} day ticker:`, error)
    return 0
  }
}

// Helper function to calculate ticker for a specific number of weeks ago
function calculateWeeksAgoTicker(entries: any, year: number, currentWeek: number, weeksAgo: number, currentEarnings: number, currentAvailableBalance: number): number {
  try {
    const pastWeek = currentWeek - weeksAgo
    const pastYear = pastWeek <= 0 ? year - 1 : year
    const adjustedPastWeek = pastWeek <= 0 ? 52 + pastWeek : pastWeek
    
    const pastWeekData = entries?.[pastYear]?.weeks?.[adjustedPastWeek]
    if (!pastWeekData) {
      return 0
    }
    
    const currentRatio = currentEarnings / (currentAvailableBalance || 1)
    const pastRatio = (parseFloat(pastWeekData.earnings) || 0) / (parseFloat(pastWeekData.availableBalance) || 1)
    
    if (pastRatio === 0) {
      return currentRatio > 0 ? 100 : 0
    }
    
    const result = ((currentRatio - pastRatio) / pastRatio) * 100
    return isNaN(result) ? 0 : result
  } catch (error) {
    console.warn(`Error calculating ${weeksAgo} week ticker:`, error)
    return 0
  }
}

export function useTickerData() {
  const [tickerData, setTickerData] = useState<TickerData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isLoaded, isSignedIn } = useAuth()

  const { session } = useContext(GlobalContext)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setIsLoading(false)
      return
    }

    const fetchTickerData = async () => {
      try {
        setIsLoading(true)
        setError(null)
        // Prefer in-memory session user from GlobalContext for immediate updates
        const userData = (session as any)?.user || null
        // If not available, fallback to API fetch
        const ensureUser = async () => {
          if (userData && userData.entries) return userData
          const response = await fetch('/api/v1/user')
          if (!response.ok) {
            throw new Error('Failed to fetch user data')
          }
          return await response.json()
        }
        const resolvedUser = await ensureUser()
        
        if (!resolvedUser.entries) {
          setTickerData({
            dailyTicker: 0,
            weeklyTicker: 0,
            threeDayTicker: 0,
            twoWeekTicker: 0,
            fourWeekTicker: 0,
            twelveWeekTicker: 0,
            twentySixWeekTicker: 0,
            fiftyTwoWeekTicker: 0,
            dailyEarnings: '0',
            weeklyEarnings: '0',
            availableBalance: resolvedUser.availableBalance || '0'
          })
          return
        }

        // Get current date and week
        const now = new Date()
        const year = now.getFullYear()
        const date = now.toISOString().split('T')[0]
        
        // Calculate week number
        const startOfYear = new Date(year, 0, 1)
        const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
        const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)

        // Get current day and week data
        const currentDay = resolvedUser.entries[year]?.days?.[date]
        const currentWeek = resolvedUser.entries[year]?.weeks?.[weekNumber]
        
        // Get current values for calculations
        const currentDayEarnings = parseFloat(currentDay?.earnings || '0')
        const currentWeekEarnings = parseFloat(currentWeek?.earnings || '0')
        const currentAvailableBalance = parseFloat(currentDay?.availableBalance || currentWeek?.availableBalance || resolvedUser.availableBalance || '0')

        // Calculate additional tickers with error handling
        // Prefer server-provided ticker objects if present, otherwise compute client-side fallback
        const dayTickerObj = typeof currentDay?.ticker === 'object' ? currentDay.ticker : null
        const weekTickerObj = typeof currentWeek?.ticker === 'object' ? currentWeek.ticker : null

        const threeDayTicker = dayTickerObj?.['3d'] ?? (calculateDaysAgoTicker(resolvedUser.entries, year, date, 3, currentDayEarnings, currentAvailableBalance) || 0)
        const twoWeekTicker = weekTickerObj?.['2w'] ?? (calculateWeeksAgoTicker(resolvedUser.entries, year, weekNumber, 2, currentWeekEarnings, currentAvailableBalance) || 0)
        const fourWeekTicker = weekTickerObj?.['4w'] ?? (calculateWeeksAgoTicker(resolvedUser.entries, year, weekNumber, 4, currentWeekEarnings, currentAvailableBalance) || 0)
        const twelveWeekTicker = weekTickerObj?.['12w'] ?? (calculateWeeksAgoTicker(resolvedUser.entries, year, weekNumber, 12, currentWeekEarnings, currentAvailableBalance) || 0)
        const twentySixWeekTicker = weekTickerObj?.['26w'] ?? (calculateWeeksAgoTicker(resolvedUser.entries, year, weekNumber, 26, currentWeekEarnings, currentAvailableBalance) || 0)
        const fiftyTwoWeekTicker = weekTickerObj?.['52w'] ?? (calculateWeeksAgoTicker(resolvedUser.entries, year, weekNumber, 52, currentWeekEarnings, currentAvailableBalance) || 0)

        setTickerData({
          dailyTicker: (typeof currentDay?.ticker === 'object' ? currentDay?.ticker?.['1d'] : currentDay?.ticker) || 0,
          weeklyTicker: (typeof currentWeek?.ticker === 'object' ? currentWeek?.ticker?.['1w'] : currentWeek?.ticker) || 0,
          threeDayTicker,
          twoWeekTicker,
          fourWeekTicker,
          twelveWeekTicker,
          twentySixWeekTicker,
          fiftyTwoWeekTicker,
          dailyEarnings: currentDay?.earnings || '0',
          weeklyEarnings: currentWeek?.earnings || '0',
          availableBalance: currentDay?.availableBalance || currentWeek?.availableBalance || resolvedUser.availableBalance || '0'
        })
      } catch (err) {
        console.error('Error fetching ticker data:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setTickerData({
          dailyTicker: 0,
          weeklyTicker: 0,
          threeDayTicker: 0,
          twoWeekTicker: 0,
          fourWeekTicker: 0,
          twelveWeekTicker: 0,
          twentySixWeekTicker: 0,
          fiftyTwoWeekTicker: 0,
          dailyEarnings: '0',
          weeklyEarnings: '0',
          availableBalance: '0'
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchTickerData()
  }, [isLoaded, isSignedIn, session])

  return { tickerData, isLoading, error }
}
