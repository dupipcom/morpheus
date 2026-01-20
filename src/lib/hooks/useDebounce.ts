import { useCallback, useRef } from 'react'

interface UseDebounceOptions {
  /**
   * If true, collects multiple calls and merges them into a single object
   * Useful for collecting multiple field updates (e.g., { gratitude: 4, optimism: 3 })
   * The callback will receive a merged object with all accumulated key-value pairs
   */
  batched?: boolean
}

/**
 * Debounce hook that delays execution of a callback function
 * @param callback - The function to debounce
 * @param delay - Delay in milliseconds
 * @param options - Options for batched mode
 * @returns Debounced callback function
 * 
 * @example
 * // Regular debounce
 * const debouncedSave = useDebounce((value) => save(value), 500)
 * 
 * @example
 * // Batched debounce (collects multiple field updates)
 * const debouncedSave = useDebounce((updates) => {
 *   // updates will be { gratitude: 4, optimism: 3, restedness: 5 }
 *   saveBatch(updates)
 * }, 5000, { batched: true })
 * 
 * // Usage: debouncedSave({ gratitude: 4 }), debouncedSave({ optimism: 3 })
 * // After 5s: callback receives { gratitude: 4, optimism: 3 }
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  options?: UseDebounceOptions
): T {
  const timeoutRef = useRef<NodeJS.Timeout>()
  const batchedDataRef = useRef<Record<string, any>>({})

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      if (options?.batched) {
        // For batched mode, merge the first argument (expected to be an object)
        if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
          Object.assign(batchedDataRef.current, args[0])
        }
        
        timeoutRef.current = setTimeout(() => {
          // Call callback with merged data
          if (Object.keys(batchedDataRef.current).length > 0) {
            const merged = { ...batchedDataRef.current }
            batchedDataRef.current = {}
            callback(merged as Parameters<T>[0])
          }
        }, delay)
      } else {
        // Regular debounce mode
      timeoutRef.current = setTimeout(() => {
        callback(...args)
      }, delay)
      }
    },
    [callback, delay, options?.batched]
  ) as T

  return debouncedCallback
}
