'use client'

import { useContext, useMemo } from 'react'
import useSWR from 'swr'
import { GlobalContext } from '@/lib/contexts'
import { jsonFetcher } from '@/lib/utils/utils'

function formatDateISO(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Fetch the current user's ACCEPTED job earnings for a list, scoped by cadence:
 * - daily: the selected date
 * - weekly: the selected week (Sunday-Saturday)
 * - one-off: all jobs
 */
export function useListEarnings(listId?: string, listRole?: string | null, date?: Date) {
  const { session } = useContext(GlobalContext)
  const userId = (session?.user as any)?.id as string | undefined

  const url = useMemo(() => {
    if (!listId || !userId) return null
    const params = new URLSearchParams({ listId, workerId: userId, status: 'ACCEPTED' })

    if (listRole?.startsWith('daily.') && date) {
      params.append('date', formatDateISO(date))
    } else if (listRole?.startsWith('weekly.') && date) {
      // Weekly: jobs for the whole week (Sunday to Saturday)
      const dayOfWeek = date.getDay()
      const weekStart = new Date(date.getTime() - dayOfWeek * 24 * 60 * 60 * 1000)
      const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
      params.append('dateStart', formatDateISO(weekStart))
      params.append('dateEnd', formatDateISO(weekEnd))
    }
    // One-off lists: no date filter

    return `/api/v1/jobs?${params.toString()}`
  }, [listId, listRole, userId, date])

  const { data } = useSWR<{ jobs: any[] }>(url, jsonFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 60000,
  })

  const jobs = data?.jobs || []

  const totals = useMemo(
    () =>
      jobs.reduce(
        (acc: { earnings: number; premium: number }, job: any) => ({
          earnings: acc.earnings + (parseFloat(job.earnings) || 0),
          premium: acc.premium + (parseFloat(job.premium) || 0),
        }),
        { earnings: 0, premium: 0 }
      ),
    [jobs]
  )

  return {
    earnings: totals.earnings,
    premium: totals.premium,
    totalGains: totals.earnings + totals.premium,
  }
}
