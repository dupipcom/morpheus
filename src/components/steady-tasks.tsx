'use client'

import { useMemo, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { GlobalContext } from '@/lib/contexts'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { OptionsButton, OptionsMenuItem } from '@/components/OptionsButton'
import { Circle, Minus } from 'lucide-react'
import { useI18n } from '@/lib/contexts/i18n'

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

export const SteadyTasks = () => {
  const { taskLists: contextTaskLists, refreshTaskLists } = useContext(GlobalContext)
  const { t } = useI18n()
  const [stableTaskLists, setStableTaskLists] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const initialFetchDone = useRef(false)

  // Maintain stable task lists that never clear once loaded
  useEffect(() => {
    if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
      setStableTaskLists(contextTaskLists)
      setIsLoading(false)
    } else if (contextTaskLists === null || contextTaskLists === undefined) {
      // Still loading
      setIsLoading(true)
    }
  }, [contextTaskLists])

  // Only fetch task lists if we don't have any data yet and haven't fetched
  useEffect(() => {
    if (!initialFetchDone.current) {
      // If we already have data, don't fetch
      if (Array.isArray(contextTaskLists) && contextTaskLists.length > 0) {
        initialFetchDone.current = true
        return
      }
      // Otherwise, fetch once
      initialFetchDone.current = true
      refreshTaskLists()
    }
  }, [contextTaskLists, refreshTaskLists])

  // Get all tasks with status "steady" or "in progress" from all lists
  const steadyTasks = useMemo(() => {
    const allTasks: any[] = []
    
    stableTaskLists.forEach((taskList: any) => {
      // Get tasks from tasks array or templateTasks
      const baseTasks = (taskList?.tasks && taskList.tasks.length > 0)
        ? taskList.tasks
        : (taskList?.templateTasks || [])
      
      // Get ephemeral tasks
      const ephemeralTasks = (taskList?.ephemeralTasks?.open || []).map((t: any) => ({ 
        ...t, 
        isEphemeral: true, 
        taskListName: taskList.name || taskList.role,
        taskListId: taskList.id,
        taskListRole: taskList.role || ''
      }))
      
      // Combine all tasks
      const tasks = [...baseTasks, ...ephemeralTasks].map((t: any) => ({
        ...t,
        taskListName: taskList.name || taskList.role,
        taskListId: taskList.id,
        taskListRole: t.taskListRole || taskList.role || ''
      }))
      
      allTasks.push(...tasks)
    })
    
    // Filter for tasks with status "steady" or "in progress"
    const filteredTasks = allTasks.filter((task: any) => {
      const taskStatus = (task?.taskStatus as TaskStatus) || 'open'
      return taskStatus === 'steady' || taskStatus === 'in progress'
    })
    
    // Sort by role priority: daily.default > weekly.default > daily.* > weekly.* > one-off
    const getRolePriority = (role: string): number => {
      if (role === 'daily.default') return 1
      if (role === 'weekly.default') return 2
      if (role?.startsWith('daily.')) return 3
      if (role?.startsWith('weekly.')) return 4
      return 5 // one-off or other roles
    }
    
    return filteredTasks.sort((a: any, b: any) => {
      const priorityA = getRolePriority(a.taskListRole || '')
      const priorityB = getRolePriority(b.taskListRole || '')
      return priorityA - priorityB
    })
  }, [stableTaskLists])

  const handleStatusChange = useCallback(async (task: any, taskListId: string, newStatus: TaskStatus) => {
    const key = task?.id || task?.localeKey || task?.name
    
    try {
      await fetch('/api/v1/tasklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateTaskStatus: true,
          taskListId: taskListId,
          taskKey: key,
          taskStatus: newStatus
        })
      })
      await refreshTaskLists()
    } catch (error) {
      console.error('Error updating task status:', error)
    }
  }, [refreshTaskLists])

  if (isLoading) {
    return (
      <div className="w-full px-1 sm:px-0">
        <ToggleGroup
          value={[]}
          onValueChange={() => {}}
          variant="outline"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 align-center justify-center w-full m-auto"
          type="multiple"
          orientation="horizontal"
        >
          {/* Show 5 skeletons on mobile, 8 on desktop */}
          {[...Array(8)].map((_, index) => (
            <div key={`skeleton-${index}`} className={`flex flex-col items-center m-1 ${index >= 5 ? 'hidden md:flex' : ''}`}>
              <Skeleton className="h-[40px] w-full rounded-md" />
            </div>
          ))}
        </ToggleGroup>
      </div>
    )
  }

  if (steadyTasks.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No tasks with status "steady" or "in progress" found.
      </div>
    )
  }

  // Limit tasks: 5 on mobile, 8 on desktop
  const mobileLimit = 5
  const desktopLimit = 8
  const hasMoreTasks = steadyTasks.length > mobileLimit

  return (
    <div className="space-y-4 w-full px-1 sm:px-0">
      <ToggleGroup
        value={[]}
        onValueChange={() => {}}
        variant="outline"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 align-center justify-center w-full m-auto"
        type="multiple"
        orientation="horizontal"
      >
        {steadyTasks.map((task: any, index: number) => {
          const taskStatus: TaskStatus = (task?.taskStatus as TaskStatus) || 'open'
          const statusColor = getStatusColor(taskStatus, 'css')
          const iconColor = getIconColor(taskStatus)
          
          // Hide tasks beyond limits using CSS
          // Tasks 0-4: always visible
          // Tasks 5-9: hidden on mobile, visible on desktop
          // Tasks 10+: hidden on all screens
          const isBeyondMobileLimit = index >= mobileLimit
          const isBeyondDesktopLimit = index >= desktopLimit
          
          let visibilityClass = 'flex flex-col items-center m-1'
          if (isBeyondDesktopLimit) {
            // Hide on all screens
            visibilityClass += ' hidden'
          } else if (isBeyondMobileLimit) {
            // Hide on mobile, show on desktop
            visibilityClass += ' hidden md:flex'
          }
          
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
              onClick: () => handleStatusChange(task, task.taskListId, status),
              icon: null,
            })),
            ...((task.times || 1) > 1 && (task.count || 0) > 0
              ? [
                  {
                    label: 'Decrement count',
                    onClick: () => {},
                    icon: <Minus className="h-4 w-4" />,
                    separator: true,
                  },
                ]
              : []),
          ]
          
          return (
            <div 
              key={`task__item--${task.name || index}`} 
              className={visibilityClass}
            >
              <div className="relative w-full flex items-center gap-2">
                <OptionsButton
                  items={optionsMenuItems}
                  statusColor={statusColor}
                  iconColor={iconColor}
                  iconFilled={taskStatus === "done"}
                  align="start"
                />
                <ToggleGroupItem 
                  className="rounded-md leading-7 text-sm min-h-[40px] h-auto flex-1 whitespace-normal break-words py-2" 
                  value={task.name} 
                  aria-label={task.name}
                  disabled
                >
                  {task.times > 1 ? `${task.count || 0}/${task.times} ` : ''}{task.displayName || task.name}
                </ToggleGroupItem>
              </div>
            </div>
          )
        })}
      </ToggleGroup>
    </div>
  )
}

