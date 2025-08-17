import { GlobalContext } from './contexts'
import { logger } from './logger'
import { useState, useEffect } from 'react'

/**
 * Checks if user data is fully loaded and ready to display
 * @param session - Current session object
 * @param timeframe - Optional timeframe to check specific data requirements
 * @returns true if user data is complete, false otherwise
 */
export const isUserDataReady = (session: any, timeframe?: string): boolean => {
  if (!session?.user) {
    return false
  }

  // Check if essential user data is available
  const hasEntries = !!session.user.entries
  const hasSettings = !!session.user.settings
  const hasAvailableBalance = session.user.availableBalance !== undefined

  // Additional checks for specific data structures
  const hasValidEntries = hasEntries && typeof session.user.entries === 'object'
  const hasValidSettings = hasSettings && typeof session.user.settings === 'object'

  // Basic validation
  if (!hasValidEntries || !hasValidSettings || !hasAvailableBalance) {
    return false
  }

  // Timeframe-specific validation
  if (timeframe === 'week') {
    // For week view, ensure weeks data structure exists and is properly initialized
    const currentYear = new Date().getFullYear()
    const hasWeeksData = !!session.user.entries[currentYear]?.weeks
    const hasWeeklyTemplate = !!session.user.settings?.weeklyTemplate
    return hasWeeksData && hasWeeklyTemplate
  } else if (timeframe === 'day') {
    // For day view, ensure days data structure exists and is properly initialized
    const currentYear = new Date().getFullYear()
    const currentDate = new Date().toISOString().split('T')[0]
    const hasDaysData = !!session.user.entries[currentYear]?.days
    const hasDailyTemplate = !!session.user.settings?.dailyTemplate
    return hasDaysData && hasDailyTemplate
  }

  return true
}

/**
 * Enhanced loading state that includes a small delay to prevent flashing
 * @param isLoading - SWR loading state
 * @param session - Current session object
 * @param delay - Delay in milliseconds (default: 100ms)
 * @param timeframe - Optional timeframe for specific data validation
 * @returns true if still loading, false if ready
 */
export const useEnhancedLoadingState = (
  isLoading: boolean, 
  session: any, 
  delay: number = 100,
  timeframe?: string
): boolean => {
  const [shouldShowLoading, setShouldShowLoading] = useState(true)

  useEffect(() => {
    const isReady = !isLoading && isUserDataReady(session, timeframe)
    
    if (isReady) {
      // Add a small delay to prevent flashing
      const timer = setTimeout(() => {
        setShouldShowLoading(false)
        logger('enhanced_loading_complete', `Data ready for ${timeframe || 'general'} view`)
      }, delay)
      
      return () => clearTimeout(timer)
    } else {
      setShouldShowLoading(true)
      if (timeframe) {
        logger('enhanced_loading_waiting', `Waiting for ${timeframe} data to be ready`)
      }
    }
  }, [isLoading, session, delay, timeframe])

  return shouldShowLoading
}

/**
 * Updates the user data by fetching from the API and updating the global context
 * @param session - Current session object
 * @param setGlobalContext - Function to update global context
 * @param globalContext - Current global context object
 */
export const updateUser = async (
  session: any,
  setGlobalContext: (context: any) => void,
  globalContext: any
) => {
  // Check if session has a valid user before making API call
  if (!session?.user) {
    logger('update_user_skip', 'No valid session user found, skipping updateUser')
    return
  }

  try {
    const response = await fetch('/api/v1/user', { method: 'GET' })
    
    if (!response.ok) {
      const errorData = await response.json()
      logger('update_user_error', `Failed to update user: ${JSON.stringify(errorData)}`)
      return
    }
    
    const updatedUser = await response.json()
    
    // Only update context if we got valid user data
    if (updatedUser && !updatedUser.error) {
      setGlobalContext({...globalContext, session: { ...session, user: updatedUser } })
    } else {
      logger('update_user_invalid_data', `Invalid user data received: ${JSON.stringify(updatedUser)}`)
    }
  } catch (e) {
    logger('update_user_exception', `Error updating user: ${e}`)
  }
}

/**
 * Generates insights by fetching from the hint API
 * @param setInsight - Function to set the insight state
 * @param cacheTag - Optional cache tag for the request (defaults to 'test')
 * @param locale - Optional locale for the insights (defaults to 'en')
 */
export const generateInsight = async (
  setInsight: (insight: any) => void,
  cacheTag: string = 'test',
  locale: string = 'en'
) => {
  const response = await fetch(`/api/v1/hint?locale=${locale}`, {
    method: 'GET',
    cache: 'force-cache',
    next: {
      revalidate: 86400,
      tags: [cacheTag],
    },
  })
  const json = await response.json()
  try {
    setInsight(JSON.parse(json.result))
  } catch (e) {
    setInsight(JSON.parse(JSON.stringify(json.result)))
  }
}

/**
 * Generic function to submit user data updates
 * @param payload - Data to submit
 * @param endpoint - API endpoint (defaults to '/api/v1/user')
 * @param method - HTTP method (defaults to 'POST')
 */
export const submitUserData = async (
  payload: any,
  endpoint: string = '/api/v1/user',
  method: string = 'POST'
) => {
  const response = await fetch(endpoint, { 
    method, 
    body: JSON.stringify(payload) 
  })
  return response
}

/**
 * Handles closing dates (days or weeks) by submitting to the API
 * @param values - Array of dates or week objects to close
 * @param timeframe - 'day' or 'week' to determine the payload structure
 * @param fullDay - Optional full day date for mood view
 */
export const handleCloseDates = async (
  values: any[],
  timeframe?: 'day' | 'week',
  fullDay?: string
) => {
  let payload: any = {}
  
  if (timeframe === 'day') {
    payload.daysToClose = values
  } else if (timeframe === 'week') {
    payload.weeksToClose = values
  } else {
    // For mood view without timeframe
    payload.daysToClose = values
    if (fullDay) {
      payload.date = fullDay
    }
  }

  return await submitUserData(payload)
}

/**
 * Handles mood submission with proper payload structure
 * @param value - The value to submit
 * @param field - The field name
 * @param fullDay - The date for the mood entry
 */
export const handleMoodSubmit = async (
  value: any,
  field: string,
  fullDay: string
) => {
  let payload: any = { date: fullDay }

  if (field === 'text') {
    payload.text = value
  } else {
    payload.mood = { [field]: value }
  }

  return await submitUserData(payload)
}

/**
 * Handles settings submission
 * @param value - The value to submit
 * @param field - The settings field name
 */
export const handleSettingsSubmit = async (
  value: any,
  field: string
) => {
  const payload = {
    settings: {
      [field]: value,
    }
  }
  return await submitUserData(payload)
} 