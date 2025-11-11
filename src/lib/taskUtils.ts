import { getWeekNumber } from '@/app/helpers'

type TaskStatus = 'in progress' | 'steady' | 'ready' | 'open' | 'done' | 'ignored'

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





