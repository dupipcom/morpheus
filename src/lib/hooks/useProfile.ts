import useSWR from 'swr'
import { useCallback } from 'react'
import { jsonFetcher } from '@/lib/utils/utils'

interface ProfileData {
  profile?: unknown
}

interface NotesData {
  notes?: unknown[]
}

/**
 * SWR hook to fetch a public profile by username
 */
export function useProfile(userName: string | null, enabled: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR<ProfileData>(
    enabled && userName ? `/api/v1/profile/${userName}` : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 1000,
    }
  )

  const refreshProfile = useCallback(async () => {
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
  const { data, error, isLoading, mutate } = useSWR<NotesData>(
    enabled && userName ? `/api/v1/profile/${userName}/notes` : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 1000,
    }
  )

  const refreshNotes = useCallback(async () => {
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
