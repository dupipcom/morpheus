import { getWeekNumber } from '@/app/helpers'

export type TaskStatus = 'in progress' | 'steady' | 'ready' | 'open' | 'done' | 'ignored'

export const STATUS_OPTIONS: TaskStatus[] = ['in progress', 'steady', 'ready', 'open', 'done', 'ignored']

/**
 * Get a unique key for a task (id > localeKey > name)
 */
export function getTaskKey(task: any): string {
  return task?.id || task?.localeKey || (typeof task?.name === 'string' ? task.name.toLowerCase() : '')
}

/**
 * Get status color for CSS or Tailwind
 */
export function getStatusColor(status: TaskStatus, format: 'css' | 'tailwind' = 'css'): string {
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
  } else {
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
}

/**
 * Get icon color for a status
 */
export function getIconColor(status: TaskStatus): string {
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

/**
 * Get task status from task object, considering optimistic updates
 */
export function getTaskStatus(
  task: any,
  optimisticStatuses?: Record<string, TaskStatus>
): TaskStatus {
  const key = getTaskKey(task)
  if (optimisticStatuses?.[key]) {
    return optimisticStatuses[key]
  }
  if (task.status && STATUS_OPTIONS.includes(task.status as TaskStatus)) {
    return task.status as TaskStatus
  }
  if (task.status === 'done') {
    return 'done'
  }
  const count = task.count || 0
  const times = task.times || 1
  if (count > 0 && count < times) {
    return 'in progress'
  }
  if (count >= times) {
    return 'done'
  }
  return 'open'
}

/**
 * Format date in local timezone (YYYY-MM-DD)
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculate the new status based on count and times
 */
export function calculateTaskStatus(
  count: number,
  times: number,
  existingStatus?: TaskStatus
): { status: TaskStatus } {
  if (count >= times) {
    return { status: 'done' }
  } else if (count > 0) {
    // Preserve manually set status (except 'open' and 'done')
    if (existingStatus && existingStatus !== 'open' && existingStatus !== 'done') {
      return { status: existingStatus }
    }
    return { status: 'in progress' }
  } else {
    return { status: 'open' }
  }
}

/**
 * Prepare next actions for incrementing task count
 */
export function prepareIncrementActions(
  allTasks: any[],
  taskName: string,
  currentCount: number,
  times: number,
  existingStatus?: TaskStatus
): any[] {
  return allTasks.map((action: any) => {
    const c = { ...action }
    if (action.name === taskName) {
      // Increment count
      c.count = (c.count || 0) + 1
      const { status } = calculateTaskStatus(c.count, times || 1, existingStatus)
      c.status = status
    }
    return c
  })
}

/**
 * Prepare next actions for decrementing task count
 */
export function prepareDecrementActions(
  allTasks: any[],
  taskName: string,
  currentCount: number,
  times: number,
  existingStatus?: TaskStatus
): any[] {
  return allTasks.map((action: any) => {
    const c = { ...action }
    if (action.name === taskName) {
      // Decrement count (can't go below 0)
      c.count = Math.max(0, (c.count || 0) - 1)
      const { status } = calculateTaskStatus(c.count, times || 1, existingStatus)
      c.status = status
    }
    return c
  })
}

/**
 * Handle ephemeral task updates after count change
 */
export async function handleEphemeralTaskUpdate(
  ephemeralTask: any,
  updatedAction: any,
  taskListId: string,
  isInClosed: boolean
): Promise<void> {
  const newCount = updatedAction.count || 0
  const times = updatedAction.times || 1

  if (isInClosed && newCount < times) {
    // Task is closed but count is now below times - reopen it
    await fetch('/api/v1/tasklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskListId: taskListId,
        ephemeralTasks: { reopen: { id: ephemeralTask.id, count: newCount } }
      })
    })
  } else if (!isInClosed) {
    // Task is in open array - update the count
    await fetch('/api/v1/tasklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskListId: taskListId,
        ephemeralTasks: { update: { id: ephemeralTask.id, count: newCount, status: updatedAction.status } }
      })
    })
  } else if (isInClosed && newCount >= times && updatedAction.status === 'done') {
    // Task is fully completed - close it if not already closed
    await fetch('/api/v1/tasklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskListId: taskListId,
        ephemeralTasks: { close: { id: ephemeralTask.id, count: newCount } }
      })
    })
  }
}

/**
 * Update user entries for completed tasks
 */
export async function updateUserEntriesForTasks(
  doneTasks: any[],
  date: string,
  listRole: string,
  justCompletedNames: string[],
  justUncompletedNames: string[]
): Promise<void> {
  const today = new Date()
  const year = Number(date.split('-')[0])

  // Handle weekly lists
  try {
    const isWeekly = typeof listRole === 'string' && listRole.startsWith('weekly')
    if (isWeekly) {
      const week = getWeekNumber(today)[1]
      if (doneTasks.length > 0) {
        await fetch('/api/v1/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekTasksAppend: doneTasks, week, date, listRole })
        })
      }
      if (justUncompletedNames.length > 0) {
        await fetch('/api/v1/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekTasksRemoveNames: justUncompletedNames, week, date, listRole })
        })
      }
    }
  } catch { }

  // Handle daily entries
  try {
    if (doneTasks.length > 0) {
      await fetch('/api/v1/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayTasksAppend: doneTasks, date, listRole })
      })
    }
    if (justUncompletedNames.length > 0) {
      await fetch('/api/v1/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayTasksRemoveNames: justUncompletedNames, date, listRole })
      })
    }
  } catch { }
}





