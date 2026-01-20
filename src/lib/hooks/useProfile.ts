import useSWR from 'swr'
import { useMemo } from 'react'

const fetcher = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch' }))
    throw new Error(errorData.error || `Failed to fetch: ${response.statusText}`)
  }
  
  // Check if response is actually JSON before parsing
  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Response is not JSON')
  }
  
  return response.json()
}

/**
 * SWR hook to fetch a public profile by username
 */
export function useProfile(userName: string | null, enabled: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled && userName ? `/api/v1/profile/${userName}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 1000,
    }
  )

  const refreshProfile = useMemo(() => async () => {
    try {
      await mutate()
    } catch (e) {
      console.error('Error refreshing profile:', e)
    }
  }, [mutate])

  return {
    profile: data?.profile || null,
    isLoading,
    error,
    refreshProfile,
  }
}

/**
 * SWR hook to fetch profile notes
 */
export function useProfileNotes(userName: string | null, enabled: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled && userName ? `/api/v1/profile/${userName}/notes` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 1000,
    }
  )

  const refreshNotes = useMemo(() => async () => {
    try {
      await mutate()
    } catch (e) {
      console.error('Error refreshing notes:', e)
    }
  }, [mutate])

  return {
    notes: data?.notes || [],
    isLoading,
    error,
    refreshNotes,
  }
}

