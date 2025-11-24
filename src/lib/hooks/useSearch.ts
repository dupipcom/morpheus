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
  
  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Response is not JSON')
  }
  
  return response.json()
}

/**
 * SWR hook to search profiles/users
 */
export function useSearch(query: string | null, enabled: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled && query ? `/api/v1/search?q=${encodeURIComponent(query)}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 1000,
    }
  )

  return {
    results: data?.results || [],
    isLoading,
    error,
    mutate,
  }
}

