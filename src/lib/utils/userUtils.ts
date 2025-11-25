import { GlobalContext } from '../contexts'
import { logger } from '../logger'
import { useState, useEffect, useMemo, useContext } from 'react'
import useSWR from 'swr'

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

  // Consider user ready when authenticated and basic containers exist;
  // do not block on optional fields like availableBalance
  const hasValidEntries = session.user.entries === undefined || typeof session.user.entries === 'object'
  const hasValidSettings = session.user.settings === undefined || typeof session.user.settings === 'object'
  if (!hasValidEntries || !hasValidSettings) return false

  // Timeframe-specific validation
  if (timeframe === 'week') {
    // Be lenient: as long as structures (if present) are objects, allow render
    return true
  } else if (timeframe === 'day') {
    // Be lenient for day as well
    return true
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
) => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
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
      setGlobalContext({
        theme,
        session: {
          ...session,
          user: updatedUser,
        },
      })
    } else {
      logger('update_user_invalid_data', `Invalid user data received: ${JSON.stringify(updatedUser)}`)
    }
  } catch (e) {
    logger('update_user_exception', `Error updating user: ${e}`)
  }
}

/**
 * SWR hook to fetch user data once and expose a refresh method for post-update revalidation
 * Ensures deduped fetch across components and no auto revalidation on focus/reconnect
 */
export const useUserData = (
  enabled: boolean = true,
) => {
  const { session, setGlobalContext, theme } = useContext(GlobalContext)
  const fetchUser = async () => {
    const response = await fetch('/api/v1/user', { method: 'GET' })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to fetch user: ${JSON.stringify(errorData)}`)
    }
    return response.json()
  }

  const swr = useSWR(enabled ? '/api/v1/user' : null, fetchUser, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    dedupingInterval: 1000,
    onSuccess: (updatedUser: any) => {
      if (updatedUser && !updatedUser.error) {
        setGlobalContext({
          theme,
          session: {
            ...session,
            user: updatedUser,
          },
        })
      }
    },
  })

  const refreshUser = useMemo(() => async () => {
    try {
      await swr.mutate()
    } catch (e) {
      logger('user_refresh_error', String(e))
    }
  }, [swr])

  return { ...swr, refreshUser }
}

/**
 * SWR hook to fetch day data once and expose a refresh method for post-update revalidation
 * Ensures deduped fetch across components and shared state in GlobalContext
 */
export const useDayData = (date: string | null, enabled: boolean = true) => {
  const { session, setGlobalContext, dayData, setDayData } = useContext(GlobalContext)
  
  const fetchDay = async () => {
    if (!date) return { day: null }
    const response = await fetch(`/api/v1/days?date=${date}`)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to fetch day: ${JSON.stringify(errorData)}`)
    }
    return response.json()
  }

  const swr = useSWR(
    enabled && session?.user && date ? `/api/v1/days?date=${date}` : null,
    fetchDay,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 1000,
      refreshInterval: 30000, // Poll every 30 seconds
      onSuccess: (data: any) => {
        if (data && date && setDayData) {
          setDayData(date, data)
        }
      },
    }
  )

  // Return cached data from context if available, otherwise use SWR data
  const cachedData = date && dayData?.[date] ? dayData[date] : swr.data

  const refreshDay = useMemo(() => async () => {
    try {
      await swr.mutate()
    } catch (e) {
      logger('day_refresh_error', String(e))
    }
  }, [swr])

  return { 
    data: cachedData, 
    isLoading: swr.isLoading, 
    error: swr.error, 
    mutate: refreshDay 
  }
}

/**
 * SWR hook to fetch wallets with polling every 30 seconds
 * Ensures deduped fetch across components and shared state
 */
export const useWallets = (enabled: boolean = true) => {
  const { session } = useContext(GlobalContext)
  
  const fetchWallets = async () => {
    const response = await fetch('/api/v1/wallet', { method: 'GET' })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to fetch wallets: ${JSON.stringify(errorData)}`)
    }
    const data = await response.json()
    return data.wallets || []
  }

  const swr = useSWR(
    enabled && session?.user ? '/api/v1/wallet' : null,
    fetchWallets,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 1000,
      refreshInterval: 30000, // Poll every 30 seconds
    }
  )

  const refreshWallets = useMemo(() => async () => {
    try {
      await swr.mutate()
    } catch (e) {
      logger('wallets_refresh_error', String(e))
    }
  }, [swr])

  return {
    wallets: swr.data || [],
    isLoading: swr.isLoading,
    error: swr.error,
    refreshWallets,
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
 * SWR hook to fetch insights once per locale; provides manual refresh
 * Default cache: one day via API route revalidation; no auto revalidate on focus
 */
export const useHint = (locale: string = 'en', cacheTag: string = 'hint') => {
  const fetchHint = async () => {
    const response = await fetch(`/api/v1/hint?locale=${locale}`, {
      method: 'GET',
      cache: 'force-cache',
      next: { revalidate: 86400, tags: [cacheTag] },
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to fetch hint: ${JSON.stringify(errorData)}`)
    }
    const json = await response.json()
    try {
      return JSON.parse(json.result)
    } catch (e) {
      return JSON.parse(JSON.stringify(json.result))
    }
  }

  const swr = useSWR(`/api/v1/hint?locale=${locale}`, fetchHint, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    dedupingInterval: 86400 * 1000,
  })

  const refreshHint = useMemo(() => async () => {
    try {
      await swr.mutate()
    } catch (e) {
      logger('hint_refresh_error', String(e))
    }
  }, [swr])

  return { ...swr, refreshHint }
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
 * @param moodContacts - Optional contacts associated with the mood
 * @param moodThings - Optional things associated with the mood
 * @param moodLifeEvents - Optional life events associated with the mood
 * @param currentText - Current text value
 * @param currentMood - Current mood state to preserve all values
 */
export const handleMoodSubmit = async (
  value: any,
  field: string,
  fullDay: string,
  moodContacts?: any[],
  moodThings?: any[],
  currentText?: string,
  currentMood?: any,
  moodLifeEvents?: any[]
) => {
  let payload: any = { date: fullDay }

  if (field === 'text') {
    payload.text = value
    // Include current mood values when saving text to prevent data loss
    if (currentMood) {
      payload.mood = currentMood
    }
    // Add mood contacts if provided
    if (moodContacts && moodContacts.length > 0) {
      payload.moodContacts = moodContacts
    }
    // Add mood things if provided
    if (moodThings && moodThings.length > 0) {
      payload.moodThings = moodThings
    }
    // Add mood life events if provided
    if (moodLifeEvents && moodLifeEvents.length > 0) {
      payload.moodLifeEvents = moodLifeEvents
    }
  } else if (field === 'contacts') {
    // Handle contacts field specifically
    if (moodContacts && moodContacts.length > 0) {
      payload.moodContacts = moodContacts
    }
    // Add mood things if provided
    if (moodThings && moodThings.length > 0) {
      payload.moodThings = moodThings
    }
    // Add mood life events if provided
    if (moodLifeEvents && moodLifeEvents.length > 0) {
      payload.moodLifeEvents = moodLifeEvents
    }
    // Include current mood values when saving contacts to prevent data loss
    if (currentMood) {
      payload.mood = currentMood
    }
  } else if (field === 'things') {
    // Handle things field specifically
    if (moodThings && moodThings.length > 0) {
      payload.moodThings = moodThings
    }
    // Add mood contacts if provided
    if (moodContacts && moodContacts.length > 0) {
      payload.moodContacts = moodContacts
    }
    // Add mood life events if provided
    if (moodLifeEvents && moodLifeEvents.length > 0) {
      payload.moodLifeEvents = moodLifeEvents
    }
    // Include current mood values when saving things to prevent data loss
    if (currentMood) {
      payload.mood = currentMood
    }
  } else if (field === 'lifeEvents') {
    // Handle life events field specifically
    if (moodLifeEvents && moodLifeEvents.length > 0) {
      payload.moodLifeEvents = moodLifeEvents
    }
    // Add mood contacts if provided
    if (moodContacts && moodContacts.length > 0) {
      payload.moodContacts = moodContacts
    }
    // Add mood things if provided
    if (moodThings && moodThings.length > 0) {
      payload.moodThings = moodThings
    }
    // Include current mood values when saving life events to prevent data loss
    if (currentMood) {
      payload.mood = currentMood
    }
  } else {
    // Include all current mood values to prevent data loss
    const moodToSubmit = currentMood ? { ...currentMood, [field]: value } : { [field]: value }
    payload.mood = moodToSubmit
    // Add mood contacts if provided
    if (moodContacts && moodContacts.length > 0) {
      payload.moodContacts = moodContacts
    }
    // Add mood things if provided
    if (moodThings && moodThings.length > 0) {
      payload.moodThings = moodThings
    }
    // Add mood life events if provided
    if (moodLifeEvents && moodLifeEvents.length > 0) {
      payload.moodLifeEvents = moodLifeEvents
    }
    // Include current text if provided (to preserve text when updating mood sliders)
    if (currentText !== undefined) {
      payload.text = currentText
    }
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