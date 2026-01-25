import useSWR from 'swr'
import { useCallback } from 'react'
import { jsonFetcher } from '@/lib/utils/utils'

interface FriendProfile {
  userId: string
  userName: string | null
  firstName?: string | null
  lastName?: string | null
  profilePicture?: string | null
  bio?: string | null
  isCloseFriend?: boolean
  isFriend?: boolean
}

interface ProfilesData {
  profiles?: FriendProfile[]
}

/**
 * SWR hook to fetch friend profiles for collaborator suggestions.
 * When no query is provided, returns the top 5 profiles sorted by relationship priority:
 * close friends first, then friends, then public profiles.
 * 
 * Use this hook instead of manual fetch calls to leverage SWR's caching,
 * deduplication, and automatic revalidation features.
 */
export function useFriendProfiles(query: string | null = null, enabled: boolean = true) {
  // Build the API URL based on whether there's a search query
  // When query is null/empty, fetch default profiles (close friends, friends, public)
  // When query has a value, fetch search results matching that query
  // When disabled (enabled=false), return null to skip fetching
  let apiUrl: string | null = null
  if (enabled) {
    apiUrl = query 
      ? `/api/v1/profiles?query=${encodeURIComponent(query)}`
      : '/api/v1/profiles'
  }

  const { data, error, isLoading, mutate } = useSWR<ProfilesData>(
    apiUrl,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 5000, // Dedupe identical requests within 5 seconds
    }
  )

  const refreshProfiles = useCallback(async () => {
    try {
      await mutate()
    } catch (e) {
      console.error('Error refreshing friend profiles:', e)
    }
  }, [mutate])

  return {
    profiles: data?.profiles || [],
    isLoading,
    error,
    refreshProfiles,
    mutate,
  }
}
