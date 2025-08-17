import { GlobalContext } from './contexts'

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
  try {
    const response = await fetch('/api/v1/user', { method: 'GET' })
    const updatedUser = await response.json()
    setGlobalContext({...globalContext, session: { ...session, user: updatedUser } })
  } catch (e) {
    console.error(e)
  }
}

/**
 * Generates insights by fetching from the hint API
 * @param setInsight - Function to set the insight state
 * @param cacheTag - Optional cache tag for the request (defaults to 'test')
 */
export const generateInsight = async (
  setInsight: (insight: any) => void,
  cacheTag: string = 'test'
) => {
  const response = await fetch('/api/v1/hint', { method: 'GET' }, {
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