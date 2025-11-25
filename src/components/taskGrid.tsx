'use client'

import React, { useMemo, useCallback } from 'react'
import { OptionsMenuItem } from '@/components/optionsButton'
import { Circle, Minus, Plus, Eye, EyeOff } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { getProfitPerTask } from '@/lib/utils/earningsUtils'
import { TaskItem } from '@/components/taskItem'
import { TaskStatus, STATUS_OPTIONS, getStatusColor, getIconColor, getTaskKey, getTaskStatus } from '@/lib/utils/taskUtils'
import { useOptimisticUpdates } from '@/lib/hooks/useOptimisticUpdates'
import { useTaskStatuses } from '@/lib/hooks/useTaskStatuses'
import { useTaskHandlers } from '@/lib/hooks/useTaskHandlers'

interface TaskGridProps {
  tasks: any[]
  selectedTaskList: any
  collabProfiles: Record<string, string>
  revealRedacted: boolean
  date: string
  onRefresh: () => Promise<void>
  onRefreshUser: () => Promise<void>
}

export const TaskGrid = ({
  tasks,
  selectedTaskList,
  collabProfiles,
  revealRedacted,
  date,
  onRefresh,
  onRefreshUser,
}: TaskGridProps) => {
  const { t } = useI18n()
  
  // Use shared hooks for optimistic updates and task statuses
  const { pendingCompletionsRef, pendingStatusUpdatesRef } = useOptimisticUpdates()
  const { taskStatuses, setTaskStatuses } = useTaskStatuses({
    tasks,
    selectedTaskListId: selectedTaskList?.id,
    date,
  })
  
  // Use shared task handlers
  const {
    handleTaskClick,
    handleStatusChange,
    handleIncrementCount,
    handleDecrementCount,
    handleToggleRedacted,
  } = useTaskHandlers({
    taskListId: selectedTaskList?.id,
    tasks,
    date,
    onRefresh,
    onRefreshUser,
    pendingCompletionsRef,
    pendingStatusUpdatesRef,
    setTaskStatuses,
  })

  // Sort tasks: by status order first, then incomplete before completed
  const sortedTasks = useMemo(() => {
    const isDone = (t: any) => {
      const key = getTaskKey(t)
      const taskStatus = taskStatuses[key] || getTaskStatus(t)
      return taskStatus === 'done'
    }
    const getTaskStatusForSort = (t: any): TaskStatus => {
      const key = getTaskKey(t)
      return taskStatuses[key] || getTaskStatus(t) || 'open'
    }

    return [...tasks].sort((a: any, b: any) => {
      const aStatus = getTaskStatusForSort(a)
      const bStatus = getTaskStatusForSort(b)
      const aStatusIndex = STATUS_OPTIONS.indexOf(aStatus)
      const bStatusIndex = STATUS_OPTIONS.indexOf(bStatus)

      // Sort by status order first
      if (aStatusIndex !== bStatusIndex) {
        return aStatusIndex - bStatusIndex
      }

      // Then sort by completion
      const aDone = isDone(a)
      const bDone = isDone(b)
      if (aDone === bDone) return 0
      return aDone ? 1 : -1
    })
  }, [tasks, taskStatuses])
  
  // Additional handlers for increment/decrement times (not in useTaskHandlers yet)
  const handleIncrementTimes = useCallback(async (task: any) => {
    if (!selectedTaskList) return
    const key = getTaskKey(task)
    const currentTimes = task?.times || 1
    const newTimes = currentTimes + 1

    try {
      const regular = tasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = tasks.filter((t: any) => t.isEphemeral)
      const allTasks = [...regular, ...ephemerals]
      
      const nextActions = allTasks.map((action: any) => {
        const c = { ...action }
        const actionKey = getTaskKey(action)
        if (actionKey === key) {
          c.times = newTimes
          const currentCount = c.count || 0
          if (currentCount >= newTimes) {
            c.status = 'done'
          } else if (currentCount > 0) {
            const existingStatus = taskStatuses[actionKey]
            if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
              c.status = 'in progress'
            } else {
              c.status = existingStatus
            }
          } else {
            c.status = 'open'
          }
        }
        return c
      })

      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId: selectedTaskList.id,
          dayActions: nextActions,
          date,
          justCompletedNames: [],
          justUncompletedNames: []
        })
      })

      const ephemeralTask = ephemerals.find((e: any) => e.id === task.id)
      if (ephemeralTask) {
        const updatedEph = nextActions.find((a: any) => getTaskKey(a) === key)
        if (updatedEph) {
          const newCount = updatedEph.count || 0
          const newTimes = updatedEph.times || 1
          
          const closedEphemerals = (selectedTaskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          
          if (isInClosed && newCount < newTimes) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { reopen: { id: ephemeralTask.id, count: newCount } }
              })
            })
          } else if (!isInClosed) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { update: { id: ephemeralTask.id, count: newCount, status: updatedEph.status, times: newTimes } }
              })
            })
          }
        }
      }

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error incrementing times:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses])
  
  const handleDecrementTimes = useCallback(async (task: any) => {
    if (!selectedTaskList) return
    const key = getTaskKey(task)
    const currentTimes = task?.times || 1
    const currentCount = task?.count || 0
    
    if (currentTimes <= 1) return

    const newTimes = currentTimes - 1
    const newCount = (currentTimes === currentCount) ? Math.max(0, currentCount - 1) : currentCount

    setTaskStatuses(prev => {
      const updated = { ...prev }
      if (newCount >= newTimes) {
        updated[key] = 'done'
      } else if (newCount > 0) {
        const existingStatus = prev[key]
        if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
          updated[key] = 'in progress'
        }
      } else if (newCount === 0) {
        updated[key] = 'open'
      }
      return updated
    })

    try {
      const regular = tasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = tasks.filter((t: any) => t.isEphemeral)
      const allTasks = [...regular, ...ephemerals]
      
      const nextActions = allTasks.map((action: any) => {
        const c = { ...action }
        const actionKey = getTaskKey(action)
        if (actionKey === key) {
          c.times = newTimes
          c.count = newCount
          if (c.count >= c.times) {
            c.status = 'done'
          } else {
            const existingStatus = taskStatuses[actionKey]
            if (c.count > 0 && (!existingStatus || existingStatus === 'done' || existingStatus === 'open')) {
              c.status = 'in progress'
            } else if (c.count === 0) {
              c.status = 'open'
            } else {
              c.status = existingStatus || 'open'
            }
          }
        }
        return c
      })

      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId: selectedTaskList.id,
          dayActions: nextActions,
          date,
          justCompletedNames: [],
          justUncompletedNames: []
        })
      })

      const ephemeralTask = ephemerals.find((e: any) => e.id === task.id)
      if (ephemeralTask) {
        const updatedEph = nextActions.find((a: any) => getTaskKey(a) === key)
        if (updatedEph) {
          const updatedCount = updatedEph.count || 0
          const updatedTimes = updatedEph.times || 1
          
          const closedEphemerals = (selectedTaskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          
          if (isInClosed && updatedCount < updatedTimes) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { reopen: { id: ephemeralTask.id, count: updatedCount } }
              })
            })
          } else if (!isInClosed) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId: selectedTaskList.id,
                ephemeralTasks: { update: { id: ephemeralTask.id, count: updatedCount, status: updatedEph.status, times: updatedTimes } }
              })
            })
          }
        }
      }

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error decrementing times:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses, setTaskStatuses])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
      {sortedTasks.map((task: any) => {
        const key = getTaskKey(task)
        const taskStatus = taskStatuses[key] || getTaskStatus(task)
        const isDone = taskStatus === 'done'
        
        // Get optimistic count from pending completions to ensure task object has latest count
        const pendingCompletion = pendingCompletionsRef.current.get(key)
        const taskWithOptimisticCount = pendingCompletion 
          ? { ...task, count: pendingCompletion.count }
          : task
        
        const lastCompleter = Array.isArray(task?.completers) && task.completers.length > 0 
          ? task.completers[task.completers.length - 1] 
          : undefined
        
        // Extract owners and collaborators from users array (new model) or fallback to old fields
        const users = Array.isArray((selectedTaskList as any)?.users) ? (selectedTaskList as any).users : []
        const ownersFromUsers = users.filter((u: any) => u.role === 'OWNER').map((u: any) => u.userId)
        const collaboratorsFromUsers = users.filter((u: any) => u.role === 'COLLABORATOR' || u.role === 'MANAGER').map((u: any) => u.userId)
        const ownersFromOld = Array.isArray((selectedTaskList as any)?.owners) ? (selectedTaskList as any).owners : []
        const collaboratorsFromOld = Array.isArray((selectedTaskList as any)?.collaborators) ? (selectedTaskList as any).collaborators : []
        const allOwners = ownersFromUsers.length > 0 ? ownersFromUsers : ownersFromOld
        const allCollaborators = collaboratorsFromUsers.length > 0 ? collaboratorsFromUsers : collaboratorsFromOld
        
        const hasCollaborators = allCollaborators.length > 0
        
        // Get the completer name: only show if there's actually a completer (don't fallback to owner)
        const completerName = lastCompleter 
          ? (collabProfiles[String(lastCompleter.id)] || String(lastCompleter.id))
          : null
        
        // Calculate earnings for THIS specific task completion
        const listBudget = (selectedTaskList as any)?.budget
        const listRole = (selectedTaskList as any)?.role
        const totalTasks = (selectedTaskList?.tasks as any[])?.length || (selectedTaskList?.templateTasks as any[])?.length || 1
        
        const taskEarnings = getProfitPerTask(listBudget, totalTasks, listRole)

        // Determine task status
        const finalTaskStatus = taskStatuses[key] || getTaskStatus(task)
        const statusColor = getStatusColor(finalTaskStatus, 'css')
        const iconColor = getIconColor(finalTaskStatus)

        // Build options menu items
        const optionsMenuItems: OptionsMenuItem[] = [
          ...STATUS_OPTIONS.map((status) => ({
            label: (
              <>
                <Circle
                  className="h-4 w-4"
                  style={{ fill: getStatusColor(status), color: getStatusColor(status) }}
                />
                <span className="ml-2">{t(`tasks.status.${status}`)}</span>
              </>
            ),
            onClick: () => handleStatusChange(taskWithOptimisticCount, status),
            icon: null,
          })),
          {
            label: t('tasks.incrementTimes', { defaultValue: 'Increment times' }),
            onClick: () => handleIncrementTimes(taskWithOptimisticCount),
            icon: <Plus className="h-4 w-4" />,
            separator: true,
          },
          {
            label: t('tasks.decrementTimes', { defaultValue: 'Decrement times' }),
            onClick: () => handleDecrementTimes(taskWithOptimisticCount),
            icon: <Minus className="h-4 w-4" />,
          },
          {
            label: task?.redacted ? t('tasks.markAsNotSensitive', { defaultValue: 'Mark as not sensitive' }) : t('tasks.markAsSensitive', { defaultValue: 'Mark as sensitive' }),
            onClick: () => handleToggleRedacted(taskWithOptimisticCount),
            icon: task?.redacted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
            separator: true,
          },
          ...((task.times || 1) > 1 && (task.count || 0) > 0
            ? [
                {
                  label: t('tasks.decrementCount'),
                  onClick: () => handleDecrementCount(taskWithOptimisticCount),
                  icon: <Minus className="h-4 w-4" />,
                  separator: true,
                },
              ]
            : []),
        ]

        return (
          <TaskItem
            key={`task__item--${key}`}
            task={taskWithOptimisticCount}
            taskStatus={finalTaskStatus}
            statusColor={statusColor}
            iconColor={iconColor}
            optionsMenuItems={optionsMenuItems}
            onClick={() => handleTaskClick(taskWithOptimisticCount)}
            revealRedacted={revealRedacted}
            showCompleterBadge={true}
            completerName={completerName}
            taskEarnings={taskEarnings}
            hasCollaborators={hasCollaborators}
            variant={isDone ? 'default' : 'outline'}
          />
        )
      })}
    </div>
  )
}

