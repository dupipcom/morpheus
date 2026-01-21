'use client'

import React, { useMemo, useState, useEffect, useContext, useRef } from 'react'
import useSWR from 'swr'

import { Skeleton } from '@/components/ui/skeleton'
import { TaskGrid } from '@/components/taskGrid'

import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { useUserData } from '@/lib/utils/userUtils'

function fetcher(url: string): Promise<any> {
  return fetch(url).then((res) => res.json())
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface ListViewProps {
  selectedTaskListId?: string
  selectedDate?: Date
  onDateChange?: (date: Date | undefined) => void
}

export function ListView({
  selectedTaskListId: propSelectedTaskListId,
  selectedDate: propSelectedDate,
}: ListViewProps = {}): React.ReactElement | null {
  const { session, taskLists: contextTaskLists, refreshTaskLists, revealRedacted } = useContext(GlobalContext)
  const { t } = useI18n()
  const { refreshUser } = useUserData()

  // Track if initial load has been done
  const initialLoadDone = useRef(false)

  // Maintain stable task lists that never clear once loaded
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      setStableTaskLists(contextTaskLists)
      initialLoadDone.current = true
    }
  }, [contextTaskLists])

  // Get today's date in local timezone, normalized to midnight
  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  // Use prop selectedDate if provided, otherwise use local state
  const [internalSelectedDate] = useState<Date>(today)
  const selectedDate = propSelectedDate !== undefined ? propSelectedDate : internalSelectedDate

  // Compute date string and year from selected date (using local timezone)
  const date = useMemo(() => formatDateLocal(selectedDate), [selectedDate])
  const year = useMemo(() => Number(date.split('-')[0]), [date])
  const allTaskLists = stableTaskLists.length > 0 ? stableTaskLists : (contextTaskLists || [])

  // Use prop selectedTaskListId if provided, otherwise use local state
  const [internalSelectedTaskListId, setInternalSelectedTaskListId] = useState<string | undefined>(allTaskLists[0]?.id)
  const selectedTaskListId = propSelectedTaskListId !== undefined ? propSelectedTaskListId : internalSelectedTaskListId

  useEffect(() => {
    if (!selectedTaskListId && allTaskLists.length > 0 && propSelectedTaskListId === undefined) {
      setInternalSelectedTaskListId(allTaskLists[0].id)
    }
  }, [allTaskLists, selectedTaskListId, propSelectedTaskListId])

  const selectedTaskList = useMemo(
    () => allTaskLists.find((l: any) => l.id === selectedTaskListId),
    [allTaskLists, selectedTaskListId]
  )

  // Helper to get all dates in a week (using local timezone)
  const getWeekDates = useMemo(() => {
    const dates: string[] = []
    const d = new Date(selectedDate)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d.setDate(diff))

    for (let i = 0; i < 7; i++) {
      const weekDate = new Date(monday)
      weekDate.setDate(monday.getDate() + i)
      dates.push(formatDateLocal(weekDate))
    }
    return dates
  }, [selectedDate])

  // Determine if current list is weekly
  const isWeeklyList = useMemo(() => {
    const role = (selectedTaskList as any)?.role
    return role && typeof role === 'string' && role.startsWith('weekly.')
  }, [selectedTaskList])

  // Get current user ID
  const userId = (session?.user as any)?.id

  // Fetch tasks from API with date parameter
  const tasksUrl = selectedTaskListId ? `/api/v1/tasks?listId=${selectedTaskListId}&date=${date}` : null
  const { data: tasksData, mutate: mutateTasks, isLoading: isLoadingTasks } = useSWR(tasksUrl, fetcher, {
    revalidateOnFocus: false,
  })
  const tasksFromApi = tasksData?.tasks || []

  // Fetch jobs from API (for the selected date or week)
  const jobsUrl = useMemo(() => {
    if (!selectedTaskListId) return null
    if (isWeeklyList) {
      return `/api/v1/jobs?listId=${selectedTaskListId}`
    }
    return `/api/v1/jobs?listId=${selectedTaskListId}&date=${date}`
  }, [selectedTaskListId, date, isWeeklyList])

  const { data: jobsData } = useSWR(jobsUrl, fetcher, {
    revalidateOnFocus: false,
  })
  const jobsFromApi = jobsData?.jobs || []

  // Profiles cache (userId -> userName) for owners, collaborators and completers
  const [collabProfiles, setCollabProfiles] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    async function fetchProfiles(): Promise<void> {
      try {
        // Extract owners and collaborators from users array (new model) or fallback to old fields
        const users = Array.isArray((selectedTaskList as any)?.users) ? (selectedTaskList as any).users : []
        const ownersFromUsers = users.filter((u: any) => u.role === 'OWNER').map((u: any) => u.userId)
        const collaboratorsFromUsers = users
          .filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER')
          .map((u: any) => u.userId)

        // Fallback to old fields for backward compatibility
        const ownersFromOld = Array.isArray((selectedTaskList as any)?.owners) ? (selectedTaskList as any).owners : []
        const collaboratorsFromOld = Array.isArray((selectedTaskList as any)?.collaborators)
          ? (selectedTaskList as any).collaborators
          : []

        const owners: string[] = ownersFromUsers.length > 0 ? ownersFromUsers : ownersFromOld
        const collaborators: string[] = collaboratorsFromUsers.length > 0 ? collaboratorsFromUsers : collaboratorsFromOld

        // Get completers - for weekly lists, check all dates in the week
        const completerIds = new Set<string>()
        const datesToCheck = isWeeklyList ? getWeekDates : [date]

        datesToCheck.forEach((checkDate: string) => {
          const dateBucket = (selectedTaskList as any)?.completedTasks?.[year]?.[checkDate]
          if (dateBucket) {
            let tasksToCheck: any[] = []
            if (Array.isArray(dateBucket)) {
              tasksToCheck = dateBucket
            } else {
              tasksToCheck = [
                ...(Array.isArray(dateBucket.openTasks) ? dateBucket.openTasks : []),
                ...(Array.isArray(dateBucket.closedTasks) ? dateBucket.closedTasks : []),
              ]
            }
            tasksToCheck.forEach((t: any) => {
              if (Array.isArray(t?.completers)) {
                t.completers.forEach((c: any) => {
                  if (c?.id) completerIds.add(String(c.id))
                })
              }
            })
          }
        })

        // Include current user ID to ensure their profile is always in cache
        const currentUserId = (session?.user as any)?.id
        const allIds = new Set([...(owners || []), ...(collaborators || []), ...Array.from(completerIds)])
        if (currentUserId) {
          allIds.add(String(currentUserId))
        }

        const ids = Array.from(allIds)
        if (!ids.length) {
          setCollabProfiles({})
          return
        }

        const res = await fetch(`/api/v1/profiles/by-ids?ids=${encodeURIComponent(ids.join(','))}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          const map: Record<string, string> = {}
          ;(data.profiles || []).forEach((p: any) => {
            map[p.userId] = p.userName || p.userId
          })
          setCollabProfiles(map)
        } else if (!cancelled) {
          setCollabProfiles({})
        }
      } catch {
        if (!cancelled) setCollabProfiles({})
      }
    }
    fetchProfiles()
    return () => {
      cancelled = true
    }
  }, [
    selectedTaskList?.id,
    JSON.stringify((selectedTaskList as any)?.users || []),
    JSON.stringify((selectedTaskList as any)?.owners || []),
    JSON.stringify((selectedTaskList as any)?.collaborators || []),
    isWeeklyList,
    getWeekDates,
    date,
    year,
    (session?.user as any)?.id,
  ])

  // Use tasks from API directly - all tasks are now in the Task collection
  const tasksToDisplay = useMemo(() => {
    return tasksFromApi.map((t: any) => ({
      ...t,
      displayName: t.name,
      count: t.dateCount !== undefined ? t.dateCount : (t.count || 0),
      times: t.times || 1,
      dateStatus: t.dateStatus,
      dateCount: t.dateCount,
    }))
  }, [tasksFromApi])

  // Check if tasks are loading for the selected date
  const isLoadingTasksForDate = isLoadingTasks && tasksUrl !== null

  // Check if task lists are loading (only show skeleton on initial load, not on refreshes)
  const isTaskListsLoading =
    !initialLoadDone.current &&
    (contextTaskLists === null || contextTaskLists === undefined || (Array.isArray(contextTaskLists) && contextTaskLists.length === 0))
  const isLoading = isTaskListsLoading || (!initialLoadDone.current && (!selectedTaskListId || !selectedTaskList))

  // Show loading state when date changes and tasks are being fetched
  if (isLoadingTasksForDate && initialLoadDone.current) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <Skeleton className="h-9 w-full sm:w-[260px]" />
          <Skeleton className="h-9 w-full sm:w-[240px]" />
          <Skeleton className="h-9 w-20" />
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
          <span className="text-muted-foreground">{t('tasks.loadingForDate')}</span>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <Skeleton className="h-9 w-full sm:w-[260px]" />
          <Skeleton className="h-9 w-full sm:w-[240px]" />
          <Skeleton className="h-9 w-20" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center m-1">
              <div className="relative w-full flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-10 flex-1 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!selectedTaskListId) return null

  return (
    <div className="space-y-4">
      <TaskGrid
        tasks={tasksToDisplay}
        selectedTaskList={selectedTaskList}
        collabProfiles={collabProfiles}
        revealRedacted={revealRedacted}
        date={date}
        userId={userId}
        jobs={jobsFromApi}
        onRefresh={refreshTaskLists}
        onRefreshUser={refreshUser}
        onRefreshTasks={mutateTasks}
      />
    </div>
  )
}
