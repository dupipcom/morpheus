export type TaskStatus = 'in progress' | 'steady' | 'ready' | 'open' | 'done' | 'ignored' | 'completed'

export const STATUS_OPTIONS: TaskStatus[] = ['in progress', 'steady', 'ready', 'open', 'done', 'ignored', 'completed']

/**
 * Get a unique key for a task (id > localeKey > name)
 */
export function getTaskKey(task: any): string {
  return task?.id || task?.localeKey || (typeof task?.name === 'string' ? task.name.toLowerCase() : '')
}

/**
 * Occurrence-scoped key for a task entry on a given day.
 *
 * A recurring task is ONE Task row materialized on many dates, so per-date UI
 * state (status, counters) must be keyed by (task id, occurrence date) — never
 * by task name or by the bare task id, which would leak one day's state into
 * every other day's entry of the same task.
 *
 * Date precedence: pastOccurrenceDate (past-day cards), occurrenceDate (entry
 * payloads), then the dateKey the caller supplies (the selected day).
 */
export function getTaskEntryKey(task: any, dateKey?: string): string {
  const occurrenceDate = task?.pastOccurrenceDate || task?.occurrenceDate || dateKey || ''
  return `${getTaskKey(task)}:${occurrenceDate}`
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
      'completed': 'var(--status-done)',
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
      'completed': 'status-done',
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
    'completed': 'var(--background)',
  }
  return colorMap[status] || 'transparent'
}

/**
 * Get task status from task object, considering optimistic updates
 * Prefers date-specific fields (dateStatus, dateCount) when available
 */
export function getTaskStatus(
  task: any,
  optimisticStatuses?: Record<string, TaskStatus>
): TaskStatus {
  const key = getTaskKey(task)
  if (optimisticStatuses?.[key]) {
    return optimisticStatuses[key]
  }

  // Prefer date-specific status when available (from date-aware API)
  if (task.dateStatus !== undefined) {
    // Map database enum values to UI status values
    const statusMap: Record<string, TaskStatus> = {
      'OPEN': 'open',
      'IN_PROGRESS': 'in progress',
      'DONE': 'done',
      'STEADY': 'steady',
      'READY': 'ready',
      'IGNORED': 'ignored',
      'COMPLETED': 'completed',
    }
    const mappedStatus = statusMap[task.dateStatus] || task.dateStatus
    if (STATUS_OPTIONS.includes(mappedStatus as TaskStatus)) {
      return mappedStatus as TaskStatus
    }
  }

  // Fall back to global status
  if (task.status && STATUS_OPTIONS.includes(task.status as TaskStatus)) {
    return task.status as TaskStatus
  }
  if (task.status === 'done') {
    return 'done'
  }

  // Use date-specific count if available, otherwise fall back to global count
  const count = task.dateCount !== undefined ? task.dateCount : (task.count || 0)
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
 * Map old status string to database enum value
 */
export function mapStatusToEnum(status: string): string {
  const statusMap: Record<string, string> = {
    'in progress': 'IN_PROGRESS',
    'steady': 'STEADY',
    'ready': 'READY',
    'open': 'OPEN',
    'done': 'DONE',
    'ignored': 'IGNORED',
    'completed': 'COMPLETED',
  }
  return statusMap[status] || status.toUpperCase() || 'OPEN'
}


