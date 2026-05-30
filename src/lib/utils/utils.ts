import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines class names using clsx and tailwind-merge for proper Tailwind CSS class merging
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Standard fetcher for SWR hooks - fetches JSON from a URL
 */
export function fetcher<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, init).then(res => res.json())
}

/**
 * JSON fetcher with error handling and content-type validation
 * Used by hooks that need more robust error handling
 */
export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
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