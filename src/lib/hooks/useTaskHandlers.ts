import { useCallback, useRef } from 'react'
import { TaskStatus, getTaskKey, calculateTaskStatus, prepareIncrementActions, prepareDecrementActions, handleEphemeralTaskUpdate, formatDateLocal } from '@/lib/taskUtils'

interface PendingCompletion {
  count: number
  status: TaskStatus
  inClosed: boolean
}

interface UseTaskHandlersOptions {
  taskListId: string
  tasks: any[]
  date: string
  onRefresh: () => Promise<void>
  onRefreshUser?: () => Promise<void>
  pendingCompletionsRef: React.MutableRefObject<Map<string, PendingCompletion>>
  pendingStatusUpdatesRef: React.MutableRefObject<Map<string, TaskStatus>>
  setTaskStatuses?: (updater: (prev: Record<string, TaskStatus>) => Record<string, TaskStatus>) => void
  optimisticStatuses?: Record<string, TaskStatus>
  setOptimisticStatuses?: (updater: (prev: Record<string, TaskStatus>) => Record<string, TaskStatus>) => void
  optimisticCounts?: Record<string, number>
  setOptimisticCounts?: (updater: (prev: Record<string, number>) => Record<string, number>) => void
  findTaskList?: (taskListId: string) => any
}

export function useTaskHandlers({
  taskListId,
  tasks,
  date,
  onRefresh,
  onRefreshUser,
  pendingCompletionsRef,
  pendingStatusUpdatesRef,
  setTaskStatuses,
  optimisticStatuses,
  setOptimisticStatuses,
  optimisticCounts,
  setOptimisticCounts,
  findTaskList,
}: UseTaskHandlersOptions) {
  
  const handleTaskClick = useCallback(async (task: any) => {
    if (!taskListId) return
    
    const key = getTaskKey(task)
    const currentCount = task?.count || 0
    const times = task?.times || 1
    const newCount = currentCount + 1
    const isFullyCompleted = newCount >= times
    
    // Track pending completion
    pendingCompletionsRef.current.set(key, {
      count: newCount,
      status: isFullyCompleted ? 'done' : 'in progress',
      inClosed: isFullyCompleted
    })
    
    // Optimistic UI update
    if (setTaskStatuses) {
      setTaskStatuses(prev => ({
        ...prev,
        [key]: isFullyCompleted ? 'done' : 'in progress'
      }))
    }
    if (setOptimisticStatuses && setOptimisticCounts) {
      const { status } = calculateTaskStatus(newCount, times, optimisticStatuses?.[key])
      setOptimisticStatuses(prev => ({ ...prev, [key]: status }))
      setOptimisticCounts(prev => ({ ...prev, [key]: newCount }))
    }
    
    try {
      // Prepare next actions
      const regular = tasks.filter((t: any) => !t.isEphemeral)
      const ephemerals = tasks.filter((t: any) => t.isEphemeral)
      const allTasks = [...regular, ...ephemerals]
      
      const nextActions = allTasks.map((action: any) => {
        const c = { ...action }
        const actionKey = getTaskKey(action)
        if (actionKey === key) {
          c.count = newCount
          c.status = isFullyCompleted ? 'done' : 'in progress'
        }
        return c
      })
      
      // Persist to API
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId,
          dayActions: nextActions,
          date,
          justCompletedNames: [task.name],
          justUncompletedNames: []
        })
      })
      
      // Handle ephemeral tasks
      if (task.isEphemeral) {
        if (isFullyCompleted) {
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId,
              ephemeralTasks: { close: { id: task.id, count: newCount } }
            })
          })
        } else {
          await fetch('/api/v1/tasklists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskListId,
              ephemeralTasks: { update: { id: task.id, count: newCount, status: 'in progress' } }
            })
          })
        }
      }
      
      await onRefresh()
      if (onRefreshUser) await onRefreshUser()
      
      // Clear pending completion
      pendingCompletionsRef.current.delete(key)
      if (setOptimisticStatuses && setOptimisticCounts) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
      }
    } catch (error) {
      console.error('Error completing task:', error)
      pendingCompletionsRef.current.delete(key)
      if (setOptimisticStatuses && setOptimisticCounts) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
      }
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, setTaskStatuses, optimisticStatuses, setOptimisticStatuses, setOptimisticCounts])

  const handleStatusChange = useCallback(async (task: any, newStatus: TaskStatus) => {
    const key = getTaskKey(task)
    const taskName = task?.name
    const effectiveStatus = newStatus

    // Track pending status update
    pendingStatusUpdatesRef.current.set(key, effectiveStatus)

    // Update local state immediately (optimistic update)
    if (setTaskStatuses) {
      setTaskStatuses(prev => ({ ...prev, [key]: effectiveStatus }))
    }
    if (setOptimisticStatuses) {
      setOptimisticStatuses(prev => ({ ...prev, [key]: effectiveStatus }))
    }

    // Persist to API
    if (!taskListId) return

    try {
      // Persist task status to API
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskStatus: true,
          taskListId,
          taskKey: key,
          status: effectiveStatus,
          date: date
        })
      })

      // If status is "done", also mark the task as completed
      if (effectiveStatus === 'done') {
        const foundTask = tasks.find((t: any) => getTaskKey(t) === key)
        if (foundTask) {
          const currentCount = foundTask?.count || 0
          const times = foundTask?.times || 1
          const newCount = currentCount + 1
          const isFullyCompleted = newCount >= times
          
          pendingCompletionsRef.current.set(key, {
            count: newCount,
            status: effectiveStatus,
            inClosed: isFullyCompleted
          })

          // Handle completion logic
          const regular = tasks.filter((t: any) => !t.isEphemeral)
          const ephemerals = tasks.filter((t: any) => t.isEphemeral)

          // Prepare next actions
          const allTasks = [...regular, ...ephemerals]
          const nextActions = allTasks.map((action: any) => {
            const c = { ...action }
            const actionKey = getTaskKey(action)
            if (actionKey === key) {
              if ((action.times - (action.count || 0)) === 1) {
                c.count = (c.count || 0) + 1
                c.status = 'done'
              } else if ((action.times - (action.count || 0)) >= 1) {
                c.count = (c.count || 0) + 1
              }
            }
            if ((c.count || 0) > 0 && c.status !== 'done') {
              c.status = 'open'
            }
            return c
          })

          // Persist to TaskList.completedTasks
          if (nextActions.length > 0) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recordCompletions: true,
                taskListId,
                dayActions: nextActions,
                date,
                justCompletedNames: [taskName],
                justUncompletedNames: []
              })
            })
          }

          // Handle ephemerals
          const ephemeralTask = ephemerals.find((e: any) => e.id === foundTask.id)
          if (ephemeralTask) {
            const updatedEph = nextActions.find((a: any) => getTaskKey(a) === key)
            if (updatedEph && updatedEph.status === 'done') {
              await fetch('/api/v1/tasklists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskListId,
                  ephemeralTasks: { close: { id: ephemeralTask.id, count: updatedEph.count } }
                })
              })
            } else if (updatedEph) {
              await fetch('/api/v1/tasklists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskListId,
                  ephemeralTasks: { update: { id: ephemeralTask.id, count: updatedEph.count, status: updatedEph.status } }
                })
              })
            }
          }

          await onRefresh()
          if (onRefreshUser) await onRefreshUser()
          
          pendingCompletionsRef.current.delete(key)
          pendingStatusUpdatesRef.current.delete(key)
        }
      } else if (effectiveStatus !== 'done') {
        // If status is changed away from "done", handle uncompletion
        const foundTask = tasks.find((t: any) => getTaskKey(t) === key)
        if (foundTask) {
          const regular = tasks.filter((t: any) => !t.isEphemeral)
          const nextActions = regular.map((action: any) => {
            const c = { ...action }
            const actionKey = getTaskKey(action)
            if (actionKey === key && (c.times || 1) <= (c.count || 0)) {
              if ((c.count || 0) > 0) {
                c.count = (c.count || 0) - 1
                c.status = 'open'
              }
            }
            if ((c.count || 0) > 0 && c.status !== 'done') {
              c.status = 'open'
            }
            return c
          })

          // Persist uncompletion
          if (nextActions.length > 0) {
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recordCompletions: true,
                taskListId,
                dayActions: nextActions,
                date,
                justCompletedNames: [],
                justUncompletedNames: [taskName]
              })
            })
          }

          // Handle ephemeral task uncompletion
          const ephemerals = tasks.filter((t: any) => t.isEphemeral)
          const ephemeralTask = ephemerals.find((e: any) => e.id === foundTask.id)
          if (ephemeralTask) {
            const newCount = Math.max(0, (ephemeralTask.count || 1) - 1)
            await fetch('/api/v1/tasklists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskListId,
                ephemeralTasks: { reopen: { id: ephemeralTask.id, count: newCount } }
              })
            })
          }

          await onRefresh()
          if (onRefreshUser) await onRefreshUser()
          
          pendingCompletionsRef.current.delete(key)
          pendingStatusUpdatesRef.current.delete(key)
        } else {
          // Status change that doesn't affect completion
          await onRefresh()
          if (onRefreshUser) await onRefreshUser()
          pendingStatusUpdatesRef.current.delete(key)
        }
      } else {
        // Status change that doesn't affect completion
        await onRefresh()
        if (onRefreshUser) await onRefreshUser()
        pendingStatusUpdatesRef.current.delete(key)
      }
    } catch (error) {
      console.error('Error saving task status:', error)
      pendingCompletionsRef.current.delete(key)
      pendingStatusUpdatesRef.current.delete(key)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
      }
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, pendingStatusUpdatesRef, setTaskStatuses, setOptimisticStatuses])

  const handleIncrementCount = useCallback(async (task: any) => {
    if (!taskListId && !task.taskListId) return
    
    const taskListIdToUse = taskListId || task.taskListId
    const taskKey = getTaskKey(task)
    const currentCount = task.count || 0
    const times = task.times || 1
    const newCount = currentCount + 1
    
    // Track pending completion
    const isFullyCompleted = newCount >= times
    const { status } = calculateTaskStatus(newCount, times, optimisticStatuses?.[taskKey] || task.taskStatus)
    pendingCompletionsRef.current.set(taskKey, {
      count: newCount,
      status,
      inClosed: isFullyCompleted
    })
    
    // Optimistic update
    if (setOptimisticCounts) {
      setOptimisticCounts(prev => ({ ...prev, [taskKey]: newCount }))
    }
    if (setOptimisticStatuses) {
      setOptimisticStatuses(prev => ({ ...prev, [taskKey]: status }))
    }
    if (setTaskStatuses) {
      setTaskStatuses(prev => ({ ...prev, [taskKey]: status }))
    }
    
    try {
      // Find the task list
      const taskList = findTaskList ? findTaskList(taskListIdToUse) : null
      if (!taskList && findTaskList) return
      
      // Get all tasks from the task list
      const baseTasks = (taskList?.tasks && taskList.tasks.length > 0)
        ? taskList.tasks
        : (taskList?.templateTasks || [])
      const ephemerals = (taskList?.ephemeralTasks?.open || [])
      const allTasks = findTaskList ? [...baseTasks, ...ephemerals] : tasks
      
      // Prepare next actions
      const nextActions = findTaskList
        ? prepareIncrementActions(
            allTasks,
            task.name,
            currentCount,
            times,
            optimisticStatuses?.[taskKey] || task.taskStatus
          )
        : allTasks.map((action: any) => {
            const c = { ...action }
            const actionKey = getTaskKey(action)
            if (actionKey === taskKey) {
              c.count = newCount
              c.status = status
            }
            return c
          })
      
      // Get today's date
      const dateToUse = date || formatDateLocal(new Date())
      
      // Persist to backend
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId: taskListIdToUse,
          dayActions: nextActions,
          date: dateToUse,
          justCompletedNames: [task.name],
          justUncompletedNames: []
        })
      })
      
      // Handle ephemeral tasks
      const ephemeralTask = ephemerals.find((e: any) => e.id === task.id || e.name === task.name)
      if (ephemeralTask) {
        const updatedAction = nextActions.find((a: any) => getTaskKey(a) === taskKey || a.name === task.name)
        if (updatedAction) {
          const closedEphemerals = (taskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          await handleEphemeralTaskUpdate(ephemeralTask, updatedAction, taskListIdToUse, isInClosed)
        }
      }
      
      await onRefresh()
      if (onRefreshUser) await onRefreshUser()
      
      // Clear optimistic updates and pending completion
      pendingCompletionsRef.current.delete(taskKey)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
      if (setOptimisticCounts) {
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
    } catch (error) {
      console.error('Error incrementing count:', error)
      // Revert optimistic updates
      pendingCompletionsRef.current.delete(taskKey)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
      if (setOptimisticCounts) {
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts, findTaskList])

  const handleDecrementCount = useCallback(async (task: any) => {
    if (!taskListId && !task.taskListId) return
    
    const taskListIdToUse = taskListId || task.taskListId
    const taskKey = getTaskKey(task)
    const currentCount = task.count || 0
    const times = task.times || 1
    
    // Can't decrement below 0
    if (currentCount <= 0) return
    
    const newCount = currentCount - 1
    const { status } = calculateTaskStatus(newCount, times, optimisticStatuses?.[taskKey] || task.taskStatus)
    
    // Optimistic update
    if (setOptimisticCounts) {
      setOptimisticCounts(prev => ({ ...prev, [taskKey]: newCount }))
    }
    if (setOptimisticStatuses) {
      setOptimisticStatuses(prev => ({ ...prev, [taskKey]: status }))
    }
    if (setTaskStatuses) {
      setTaskStatuses(prev => {
        const updated = { ...prev }
        if (newCount >= times) {
          updated[taskKey] = 'done'
        } else if (newCount > 0) {
          const existingStatus = prev[taskKey]
          if (!existingStatus || existingStatus === 'done' || existingStatus === 'open') {
            updated[taskKey] = 'in progress'
          } else {
            updated[taskKey] = status
          }
        } else if (newCount === 0) {
          updated[taskKey] = 'open'
        }
        return updated
      })
    }
    
    try {
      // Find the task list
      const taskList = findTaskList ? findTaskList(taskListIdToUse) : null
      if (!taskList && findTaskList) return
      
      // Get all tasks from the task list
      const baseTasks = (taskList?.tasks && taskList.tasks.length > 0)
        ? taskList.tasks
        : (taskList?.templateTasks || [])
      const ephemerals = (taskList?.ephemeralTasks?.open || [])
      const allTasks = findTaskList ? [...baseTasks, ...ephemerals] : tasks
      
      // Prepare next actions
      const nextActions = findTaskList
        ? prepareDecrementActions(
            allTasks,
            task.name,
            currentCount,
            times,
            optimisticStatuses?.[taskKey] || task.taskStatus
          )
        : allTasks.map((action: any) => {
            const c = { ...action }
            const actionKey = getTaskKey(action)
            if (actionKey === taskKey) {
              c.count = Math.max(0, (c.count || 0) - 1)
              if (c.count >= (c.times || 1)) {
                c.status = 'done'
              } else {
                const existingStatus = optimisticStatuses?.[actionKey]
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
      
      // Get today's date
      const dateToUse = date || formatDateLocal(new Date())
      
      // Persist to backend
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordCompletions: true,
          taskListId: taskListIdToUse,
          dayActions: nextActions,
          date: dateToUse,
          justCompletedNames: [],
          justUncompletedNames: []
        })
      })
      
      // Handle ephemeral tasks
      const ephemeralTask = ephemerals.find((e: any) => e.id === task.id || e.name === task.name)
      if (ephemeralTask) {
        const updatedAction = nextActions.find((a: any) => getTaskKey(a) === taskKey || a.name === task.name)
        if (updatedAction) {
          const closedEphemerals = (taskList?.ephemeralTasks?.closed || [])
          const isInClosed = closedEphemerals.some((t: any) => t.id === ephemeralTask.id)
          await handleEphemeralTaskUpdate(ephemeralTask, updatedAction, taskListIdToUse, isInClosed)
        }
      }
      
      await onRefresh()
      if (onRefreshUser) await onRefreshUser()
      
      // Clear optimistic updates and pending completion
      pendingCompletionsRef.current.delete(taskKey)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
      if (setOptimisticCounts) {
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
    } catch (error) {
      console.error('Error decrementing count:', error)
      // Revert optimistic updates
      pendingCompletionsRef.current.delete(taskKey)
      if (setOptimisticStatuses) {
        setOptimisticStatuses(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
      if (setOptimisticCounts) {
        setOptimisticCounts(prev => {
          const updated = { ...prev }
          delete updated[taskKey]
          return updated
        })
      }
    }
  }, [taskListId, tasks, date, onRefresh, onRefreshUser, pendingCompletionsRef, optimisticStatuses, setTaskStatuses, setOptimisticStatuses, setOptimisticCounts, findTaskList])

  const handleToggleRedacted = useCallback(async (task: any) => {
    const taskListIdToUse = taskListId || task.taskListId
    if (!taskListIdToUse) return
    
    const key = getTaskKey(task)
    const currentRedacted = task?.redacted || false
    const newRedacted = !currentRedacted

    try {
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskRedacted: true,
          taskListId: taskListIdToUse,
          taskKey: key,
          redacted: newRedacted
        })
      })
      await onRefresh()
    } catch (error) {
      console.error('Error toggling task redacted status:', error)
    }
  }, [taskListId, onRefresh])

  return {
    handleTaskClick,
    handleStatusChange,
    handleIncrementCount,
    handleDecrementCount,
    handleToggleRedacted,
  }
}

