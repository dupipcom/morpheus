import useSWR from 'swr'
import { useCallback, useMemo } from 'react'
import { jsonFetcher } from '@/lib/utils/utils'

export interface FriendProfile {
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
 * 
 * This hook fetches all profiles once and refreshes at a 10-second interval.
 * Instead of re-fetching when query changes, it filters the cached data locally.
 * This approach reduces API calls and provides instant filtering.
 * 
 * @param query - Optional search query to filter profiles by username, firstName, or lastName
 * @param enabled - Whether to enable fetching (default: true)
 * @returns Object with filtered profiles, loading state, error, and refresh function
 * 
 * Use this hook instead of manual fetch calls to leverage SWR's caching,
 * deduplication, and automatic revalidation features.
 */
export function useFriendProfiles(query: string | null = null, enabled: boolean = true) {
  // Always fetch from the base profiles endpoint (no query parameter)
  // Filtering is done locally from cached data
  const apiUrl = enabled ? '/api/v1/profiles' : null

  const { data, error, isLoading, mutate } = useSWR<ProfilesData>(
    apiUrl,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 5000, // Dedupe identical requests within 5 seconds
      refreshInterval: 10000, // Refresh data every 10 seconds
    }
  )

  // Filter profiles locally based on the query parameter
  // This avoids making new API calls when the query changes
  const filteredProfiles = useMemo(() => {
    const allProfiles = data?.profiles || []
    
    if (!query || !query.trim()) {
      // Return all profiles when no query is provided
      return allProfiles
    }
    
    const normalizedQuery = query.trim().toLowerCase()
    
    // Filter profiles by matching username, firstName, or lastName
    return allProfiles.filter((profile) => {
      const userName = profile.userName?.toLowerCase() || ''
      const firstName = profile.firstName?.toLowerCase() || ''
      const lastName = profile.lastName?.toLowerCase() || ''
      
      return (
        userName.includes(normalizedQuery) ||
        firstName.includes(normalizedQuery) ||
        lastName.includes(normalizedQuery)
      )
    })
  }, [data?.profiles, query])

  const refreshProfiles = useCallback(async () => {
    try {
      await mutate()
    } catch (e) {
      console.error('Error refreshing friend profiles:', e)
    }
  }, [mutate])

  return {
    profiles: filteredProfiles,
    allProfiles: data?.profiles || [],
    isLoading,
    error,
    refreshProfiles,
  }
}
