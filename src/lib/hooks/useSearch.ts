import useSWR from 'swr'
import { jsonFetcher } from '@/lib/utils/utils'

interface SearchData {
  results?: unknown[]
}

/**
 * SWR hook to search profiles/users
 */
export function useSearch(query: string | null, enabled: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR<SearchData>(
    enabled && query ? `/api/v1/search?q=${encodeURIComponent(query)}` : null,
    jsonFetcher,
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
