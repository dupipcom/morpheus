'use client'

import React, { useMemo, useState, useContext } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskGrid } from '@/components/taskGrid'
import { GlobalContext } from '@/lib/contexts'
import { useI18n } from '@/lib/contexts/i18n'
import { useTasksHybrid } from '@/lib/hooks/useTasksHybrid'
import { useSimpleTaskHandlers } from '@/lib/hooks/useSimpleTaskHandlers'

type TaskStatus = 'in progress' | 'steady' | 'ready' | 'open' | 'done' | 'ignored'

const STATUS_OPTIONS: TaskStatus[] = ['in progress', 'steady', 'ready', 'open', 'done', 'ignored']

const getStatusColor = (status: TaskStatus, format = "css"): string => {
  if (format === 'css') {
    const colorMap: Record<TaskStatus, string> = {
      'in progress': 'var(--status-in-progress)',
      'steady': 'var(--status-steady)',
      'ready': 'var(--status-ready)',
      'open': 'var(--status-open)',
      'done': 'var(--status-done)',
      'ignored': 'var(--status-ignored)',
    }
    return colorMap[status] || 'transparent'
  } else if (format === 'tailwind') {
    const colorMap: Record<TaskStatus, string> = {
      'in progress': 'status-in-progress',
      'steady': 'status-steady',
      'ready': 'status-ready',
      'open': 'status-open',
      'done': 'status-done',
      'ignored': 'status-ignored',
    }
    return colorMap[status] || 'transparent'
  }
  return 'transparent'
}

const getIconColor = (status: TaskStatus): string => {
  const colorMap: Record<TaskStatus, string> = {
    'in progress': 'var(--accent-foreground)',
    'steady': 'var(--accent-foreground)',
    'ready': 'var(--accent-foreground)',
    'open': 'var(--accent)',
    'done': 'var(--background)',
    'ignored': 'var(--accent)',
  }
  return colorMap[status] || 'transparent'
}

// Helper function to format date in local timezone (YYYY-MM-DD)
const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const ListViewHybrid = ({
  selectedTaskListId: propSelectedTaskListId,
  selectedDate: propSelectedDate,
  onDateChange: propOnDateChange,
}: {
  selectedTaskListId?: string
  selectedDate?: Date
  onDateChange?: (date: Date | undefined) => void
} = {}) => {
  const { session, taskLists: contextTaskLists, refreshTaskLists } = useContext(GlobalContext)
  const { t, locale } = useI18n()

  // Get today's date in local timezone
  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  // Use prop selectedDate if provided, otherwise use local state
  const [internalSelectedDate, setInternalSelectedDate] = useState<Date>(today)
  const selectedDate = propSelectedDate !== undefined ? propSelectedDate : internalSelectedDate

  const onDateChange = propOnDateChange || setInternalSelectedDate

  // Format selected date as YYYY-MM-DD
  const date = useMemo(() => formatDateLocal(selectedDate), [selectedDate])

  // Get selected task list
  const selectedTaskList = useMemo(() => {
    if (!propSelectedTaskListId || !Array.isArray(contextTaskLists)) return null
    return contextTaskLists.find((list: any) => list.id === propSelectedTaskListId)
  }, [propSelectedTaskListId, contextTaskLists])

  // Load tasks using hybrid hook
  const { tasks, isLoading, error, dataSource } = useTasksHybrid({
    listId: selectedTaskList?.id,
    date,
    enabled: !!selectedTaskList
  })

  // Simple task handlers
  const {
    updateTaskStatus,
    completeTask,
    getOptimisticStatus,
    isUpdating
  } = useSimpleTaskHandlers({
    listId: selectedTaskList?.id,
    onSuccess: refreshTaskLists
  })

  // Merge tasks with optimistic status updates
  const displayTasks = useMemo(() => {
    return tasks.map(task => {
      const optimisticStatus = getOptimisticStatus(task)
      return optimisticStatus ? { ...task, status: optimisticStatus } : task
    })
  }, [tasks, getOptimisticStatus])

  // Filter tasks by localization
  const localizedTasks = useMemo(() => {
    return displayTasks.map(task => {
      const displayName = task.localeKey ? (t(task.localeKey) || task.name) : task.name
      return { ...task, displayName }
    })
  }, [displayTasks, t])

  // Handle task click (complete task)
  const handleTaskClick = async (task: any) => {
    try {
      await completeTask(task)
    } catch (error) {
      console.error('Error completing task:', error)
    }
  }

  // Handle status change
  const handleStatusChange = async (task: any, newStatus: string) => {
    try {
      await updateTaskStatus(task, newStatus)
    } catch (error) {
      console.error('Error updating task status:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        Error loading tasks: {error.message}
      </div>
    )
  }

  if (!selectedTaskList) {
    return (
      <div className="p-4 text-muted-foreground">
        No task list selected
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Debug info - remove in production */}
      <div className="text-xs text-muted-foreground px-4">
        Data source: {dataSource} | Tasks: {localizedTasks.length}
      </div>

      <TaskGrid
        tasks={localizedTasks}
        onTaskClick={handleTaskClick}
        onStatusChange={handleStatusChange}
        statusOptions={STATUS_OPTIONS}
        getStatusColor={getStatusColor}
        getIconColor={getIconColor}
        isUpdating={isUpdating}
      />
    </div>
  )
}
