'use client'

import { useMemo, useContext, useEffect, useState, useCallback } from 'react'
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

  // Fetch task lists on mount
  useEffect(() => {
    refreshTaskLists()
  }, [refreshTaskLists])

  // Get all tasks with status "steady" or "in progress" from all lists
  const steadyTasks = useMemo(() => {
    const allTasks: any[] = []
    
    stableTaskLists.forEach((taskList: any) => {
      // Get tasks from tasks array or templateTasks
      const baseTasks = (taskList?.tasks && taskList.tasks.length > 0)
        ? taskList.tasks
        : (taskList?.templateTasks || [])
      
      // Get ephemeral tasks
      const ephemeralTasks = (taskList?.ephemeralTasks?.open || []).map((t: any) => ({ ...t, isEphemeral: true, taskListName: taskList.name || taskList.role }))
      
      // Combine all tasks
      const tasks = [...baseTasks, ...ephemeralTasks].map((t: any) => ({
        ...t,
        taskListName: taskList.name || taskList.role,
        taskListId: taskList.id
      }))
      
      allTasks.push(...tasks)
    })
    
    // Filter for tasks with status "steady" or "in progress"
    return allTasks.filter((task: any) => {
      const taskStatus = (task?.taskStatus as TaskStatus) || 'open'
      return taskStatus === 'steady' || taskStatus === 'in progress'
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
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
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

  return (
    <div className="space-y-4">
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
            <div key={`task__item--${task.name || index}`} className="flex flex-col items-center m-1">
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

