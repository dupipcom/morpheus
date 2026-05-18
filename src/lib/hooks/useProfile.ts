import useSWR from 'swr'
import { useCallback } from 'react'
import { jsonFetcher } from '@/lib/utils/utils'

interface ProfileData {
  profile?: unknown
}

interface NotesData {
  notes?: unknown[]
}

interface ProfileNotesOptions {
  visibility?: 'PUBLIC' | 'PRIVATE'
  sort?: 'date' | 'most_relevant'
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
export function useProfileNotes(
  userName: string | null,
  enabled: boolean = true,
  options: ProfileNotesOptions = {}
) {
  const params = new URLSearchParams()
  if (options.visibility) params.set('visibility', options.visibility)
  if (options.sort) params.set('sort', options.sort)
  const notesEndpoint = enabled && userName
    ? `/api/v1/profile/${userName}/notes${params.toString() ? `?${params.toString()}` : ''}`
    : null

  const { data, error, isLoading, mutate } = useSWR<NotesData>(
    notesEndpoint,
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
