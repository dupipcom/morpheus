'use client'

import React, { useMemo, useCallback, useState, useContext } from 'react'
import { OptionsMenuItem } from '@/components/optionsButton'
import { Circle, Minus, Plus, Eye, EyeOff, Edit } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'
import { GlobalContext } from '@/lib/contexts'
import { getProfitPerTask } from '@/lib/utils/earningsUtils'
import { TaskItem } from '@/components/taskItem'
import { TaskStatus, STATUS_OPTIONS, getStatusColor, getIconColor, getTaskKey, getTaskStatus, mapStatusToEnum } from '@/lib/utils/taskUtils'

function calculateNewStatus(count: number, times: number, existingStatus?: string): string {
  if (count >= times) return 'DONE'
  if (count > 0) {
    if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
      return 'IN_PROGRESS'
    }
    return mapStatusToEnum(existingStatus)
  }
  return 'OPEN'
}
import { useOptimisticUpdates } from '@/lib/hooks/useOptimisticUpdates'
import { useTaskStatuses } from '@/lib/hooks/useTaskStatuses'
import { useTaskHandlers } from '@/lib/hooks/useTaskHandlers'
import { AddTaskForm } from '@/views/forms/addTaskForm'

interface TaskGridProps {
  tasks: any[]
  selectedTaskList: any
  collabProfiles: Record<string, string>
  revealRedacted: boolean
  date: string
  userId: string
  jobs?: any[]
  onRefresh: () => Promise<void>
  onRefreshUser: () => Promise<void>
  onRefreshTasks?: () => Promise<void>
}

export const TaskGrid = ({
  tasks,
  selectedTaskList,
  collabProfiles,
  revealRedacted,
  date,
  userId,
  jobs = [],
  onRefresh,
  onRefreshUser,
  onRefreshTasks,
}: TaskGridProps) => {
  const { t } = useI18n()
  const { refreshTaskLists, handleTaskCompletionOptimistic } = useContext(GlobalContext)
  const [editingTask, setEditingTask] = useState<any>(null)

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
    handleValidateJob,
    handleAddPeerReview,
    handleAddManagerReview,
  } = useTaskHandlers({
    taskListId: selectedTaskList?.id,
    tasks,
    date,
    userId,
    selectedTaskList,
    onRefresh,
    onRefreshUser,
    onRefreshTasks,
    onRefreshTaskLists: refreshTaskLists,
    onTaskCompletedOptimistic: handleTaskCompletionOptimistic,
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
  
  // Additional handlers for increment/decrement times
  const handleIncrementTimes = useCallback(async (task: any) => {
    if (!selectedTaskList || !task.id) return
    const key = getTaskKey(task)
    const currentTimes = task?.times || 1
    const newTimes = currentTimes + 1
    const currentCount = task?.count || 0

    // Calculate new status based on count and new times
    const newStatus = calculateNewStatus(currentCount, newTimes, taskStatuses[key])

    try {
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          times: newTimes,
          status: newStatus
        })
      })

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error incrementing times:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses])
  
  const handleDecrementTimes = useCallback(async (task: any) => {
    if (!selectedTaskList || !task.id) return
    const key = getTaskKey(task)
    const currentTimes = task?.times || 1
    const currentCount = task?.count || 0

    if (currentTimes <= 1) return

    const newTimes = currentTimes - 1
    const newCount = (currentTimes === currentCount) ? Math.max(0, currentCount - 1) : currentCount

    // Calculate new status
    const newStatus = calculateNewStatus(newCount, newTimes, taskStatuses[key])

    // Optimistic update
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
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          times: newTimes,
          count: newCount,
          status: newStatus
        })
      })

      await onRefresh()
      await onRefreshUser()
    } catch (error) {
      console.error('Error decrementing times:', error)
    }
  }, [selectedTaskList, tasks, date, onRefresh, onRefreshUser, taskStatuses, setTaskStatuses])

  return (
    <>
      {editingTask && (
        <AddTaskForm
          selectedTaskListId={selectedTaskList?.id}
          editTask={editingTask}
          onCancel={() => setEditingTask(null)}
          onCreated={async () => {
            await onRefresh()
            setEditingTask(null)
          }}
        />
      )}
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
        
        // Get jobs for this task (from new job system)
        const taskJobs = jobs.filter((j: any) => j.taskId === task.id)
        const latestJob = taskJobs.length > 0 ? taskJobs[0] : null

        // For backward compatibility, check old completers array
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

        // Get the completer name: prioritize latest job, fallback to old completer
        const completerName = latestJob
          ? (latestJob.worker?.profiles?.[0]?.username || collabProfiles[String(latestJob.workerId)] || String(latestJob.workerId))
          : lastCompleter
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

        // Determine user role for job validation
        const userRole = users.find((u: any) => u.userId === userId)?.role || 'COLLABORATOR'
        const hasPendingJobs = taskJobs.some((j: any) => j.status === 'VALIDATING')
        const canValidateJobs = (userRole === 'OWNER' || userRole === 'MANAGER') && hasPendingJobs

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
            label: t('tasks.edit', { defaultValue: 'Edit' }),
            onClick: () => {
              // Find the source task from list.tasks (the template)
              const sourceTask = selectedTaskList?.tasks?.find((t: any) =>
                t.id === task.id ||
                t.localeKey === task.localeKey ||
                (t.name && task.name && t.name.toLowerCase() === task.name.toLowerCase())
              ) || selectedTaskList?.templateTasks?.find((t: any) =>
                t.id === task.id ||
                t.localeKey === task.localeKey ||
                (t.name && task.name && t.name.toLowerCase() === task.name.toLowerCase())
              )
              // Use source task if found, otherwise fall back to current task for ephemeral tasks
              setEditingTask(sourceTask || taskWithOptimisticCount)
            },
            icon: <Edit className="h-4 w-4" />,
            separator: true,
          },
          {
            label: t('tasks.incrementTimes', { defaultValue: 'Increment times' }),
            onClick: () => handleIncrementTimes(taskWithOptimisticCount),
            icon: <Plus className="h-4 w-4" />,
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
            latestJob={latestJob}
            hasPendingJobs={hasPendingJobs}
          />
        )
      })}
      </div>
    </>
  )
}

