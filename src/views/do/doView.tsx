'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'

import { Skeleton } from '@/components/ui/skeleton'
import { TaskGrid } from '@/components/taskGrid'
import { AddTaskForm } from '@/views/forms/addTaskForm'
import { AddListForm } from '@/views/forms/addListForm'
import { useTaskLists } from '@/lib/hooks/useTaskLists'
import { useI18n } from '@/lib/contexts/i18n'
import { useUserData } from '@/lib/utils/userUtils'
import { jsonFetcher } from '@/lib/utils/utils'

// Helper function to format date in local timezone (YYYY-MM-DD)
const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const DoView = ({
  selectedTaskListId,
  selectedDate,
  showAddTask,
  showAddList,
  isEditingList,
  onCloseAddTask,
  onCloseAddList,
  onListCreated,
}: {
  selectedTaskListId?: string
  selectedDate?: Date
  onDateChange?: (date: Date | undefined) => void
  showAddTask?: boolean
  showAddList?: boolean
  isEditingList?: boolean
  onCloseAddTask?: () => void
  onCloseAddList?: () => void
  onListCreated?: (newListId?: string) => Promise<void> | void
}) => {
  const { t } = useI18n()
  const { taskLists, refreshTaskLists } = useTaskLists()
  const { data: userData, refreshUser } = useUserData()
  const userId = (userData as any)?.id as string | undefined

  // Compute the selected date string (YYYY-MM-DD, local timezone)
  const date = useMemo(
    () => formatDateLocal(selectedDate || new Date()),
    [selectedDate]
  )

  const selectedTaskList = useMemo(
    () => taskLists.find((l: any) => l.id === selectedTaskListId),
    [taskLists, selectedTaskListId]
  )

  const isWeeklyList = useMemo(() => {
    const role = selectedTaskList?.role
    return typeof role === 'string' && role.startsWith('weekly.')
  }, [selectedTaskList])

  // Fetch tasks for the selected date/list (date-aware, RRULE-based)
  const tasksUrl = selectedTaskListId ? `/api/v1/tasks?listId=${selectedTaskListId}&date=${date}` : null
  const { data: tasksData, mutate: mutateTasks, isLoading: isLoadingTasks } = useSWR<{ tasks: any[] }>(
    tasksUrl,
    jsonFetcher,
    { revalidateOnFocus: false }
  )
  const tasksFromApi = tasksData?.tasks || []

  // Fetch jobs (weekly lists are not date-filtered; the API aggregates per task)
  const jobsUrl = useMemo(() => {
    if (!selectedTaskListId) return null
    if (isWeeklyList) return `/api/v1/jobs?listId=${selectedTaskListId}`
    return `/api/v1/jobs?listId=${selectedTaskListId}&date=${date}`
  }, [selectedTaskListId, date, isWeeklyList])

  const { data: jobsData, mutate: mutateJobs } = useSWR<{ jobs: any[] }>(
    jobsUrl,
    jsonFetcher,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  )
  const jobsFromApi = jobsData?.jobs || []

  // Past-day pending/under-review entries (infinite scroll, 7-day default window).
  // Weekly lists are skipped: their cards already surface every non-terminal
  // job of the week (the jobs fetch above is date-unfiltered for weekly lists).
  const windowStart = useMemo(() => {
    const d = new Date(selectedDate || new Date())
    d.setDate(d.getDate() - 7)
    return formatDateLocal(d)
  }, [selectedDate])

  const pastBaseUrl = useMemo(() => {
    if (!selectedTaskListId || isWeeklyList) return null
    return `/api/v1/tasks/past-pending?listId=${selectedTaskListId}&before=${date}&windowStart=${windowStart}`
  }, [selectedTaskListId, isWeeklyList, date, windowStart])

  const {
    data: pastPages,
    size,
    setSize,
    isLoading: isLoadingPast,
    mutate: mutatePast,
  } = useSWRInfinite<{ entries: any[]; nextCursor: { occurrenceDate: string; id: string } | null }>(
    (pageIndex, previousPageData) => {
      if (!pastBaseUrl) return null
      if (pageIndex === 0) return pastBaseUrl
      if (!previousPageData?.nextCursor) return null
      const cursor = previousPageData.nextCursor
      return `${pastBaseUrl}&cursorDate=${cursor.occurrenceDate}&cursorId=${cursor.id}`
    },
    jsonFetcher,
    { revalidateOnFocus: false }
  )

  const pastEntries = useMemo(
    () => (pastPages || []).flatMap((page) => page?.entries || []),
    [pastPages]
  )
  const hasMorePast = useMemo(
    () => (pastPages?.at(-1)?.nextCursor ?? null) !== null && (pastPages?.length ?? 0) > 0,
    [pastPages]
  )

  // Profiles cache (userId -> userName) for owners, collaborators and job workers
  const [collabProfiles, setCollabProfiles] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const users = Array.isArray(selectedTaskList?.users) ? selectedTaskList.users : []
        const listUserIds = users.map((u: any) => u.userId)
        const workerIds = jobsFromApi.map((j: any) => j.workerId).filter(Boolean)
        const completerIds = tasksFromApi.flatMap((t: any) =>
          Array.isArray(t.completers) ? t.completers.map((c: any) => c.id) : []
        )
        const ids = Array.from(new Set([...listUserIds, ...workerIds, ...completerIds].map(String)))
        if (!ids.length) { setCollabProfiles({}); return }
        const res = await fetch(`/api/v1/profiles/by-ids?ids=${encodeURIComponent(ids.join(','))}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          const map: Record<string, string> = {}
          ;(data.profiles || []).forEach((p: any) => { map[p.userId] = p.userName || p.userId })
          setCollabProfiles(map)
        } else if (!cancelled) {
          setCollabProfiles({})
        }
      } catch {
        if (!cancelled) setCollabProfiles({})
      }
    }
    run()
    return () => { cancelled = true }
  }, [selectedTaskList?.id, JSON.stringify(selectedTaskList?.users || []), jobsFromApi.length, tasksFromApi.length, date])

  // Single refresh used after mutations
  const handleRefreshJobData = useCallback(async () => {
    await Promise.all([
      mutateTasks(),
      mutateJobs(),
      mutatePast(),
      refreshTaskLists(),
    ])
  }, [mutateTasks, mutateJobs, mutatePast, refreshTaskLists])

  // Loading state: still waiting for the list (first load) or tasks for the date
  const isWaitingForList = taskLists.length === 0 && !selectedTaskList
  const isLoadingTasksForDate = isLoadingTasks && tasksUrl !== null

  if (isWaitingForList || isLoadingTasksForDate) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <Skeleton className="h-9 w-full sm:w-[260px]" />
          <Skeleton className="h-9 w-full sm:w-[240px]" />
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
          <span className="text-muted-foreground">{t('tasks.loadingForDate', { defaultValue: 'Loading tasks...' })}</span>
        </div>
      </div>
    )
  }

  if (!selectedTaskListId) return null

  return (
    <>
      <AddTaskForm
        open={showAddTask || false}
        onOpenChange={(open) => {
          if (!open && onCloseAddTask) onCloseAddTask()
        }}
        selectedTaskListId={selectedTaskListId}
        onCreated={async () => {
          await handleRefreshJobData()
        }}
      />

      <AddListForm
        open={showAddList || false}
        onOpenChange={(open) => {
          if (!open && onCloseAddList) onCloseAddList()
        }}
        isEditing={isEditingList || false}
        initialList={isEditingList ? selectedTaskList : undefined}
        onCreated={async (newListId) => {
          if (onListCreated) await onListCreated(newListId)
        }}
      />

      <div className="space-y-4">
        <TaskGrid
          tasks={tasksFromApi}
          selectedTaskList={selectedTaskList}
          collabProfiles={collabProfiles}
          date={date}
          userId={userId || ''}
          jobs={jobsFromApi}
          onRefresh={handleRefreshJobData}
          onRefreshUser={refreshUser}
          onRefreshTasks={async () => { await mutateTasks() }}
          pastEntries={pastEntries}
          hasMorePast={hasMorePast}
          isLoadingPast={isLoadingPast}
          onLoadPastOlder={() => setSize(size + 1)}
        />
      </div>
    </>
  )
}
