/**
 * TypeScript interfaces for the TaskList service layer
 * These types define the data structures used across all tasklist operations
 */

import { Productivity, ListProductivity } from '@/lib/types'

// Re-export for convenience
export type { Productivity, ListProductivity }

/**
 * User balance values extracted from database
 */
export interface UserBalanceValues {
  userBalance: number
  userStash: number
  userEquity: number
}

/**
 * Basic user data needed for tasklist operations
 */
export interface TaskListUser {
  id: string
  userId: string
  availableBalance: number | string | null
  stash: number | string | null
  equity: number | string | null
  profit?: number | string | null
}

/**
 * Partial user for minimal operations
 */
export interface MinimalUser {
  id: string
  userId?: string
}

/**
 * Task membership entry in a TaskList
 */
export interface TaskListMembership {
  userId: string
  role: 'OWNER' | 'COLLABORATOR' | 'MANAGER'
}

/**
 * Completer entry tracking who completed a task
 */
export interface TaskCompleter {
  id: string
  earnings: number
  prize: number
  time: number
  completedAt: Date | string
}

/**
 * Core task structure
 */
export interface Task {
  id?: string
  name: string
  localeKey?: string
  categories?: string[]
  area?: string
  status?: string
  cadence?: string
  times?: number
  count?: number
  contacts?: string[]
  things?: string[]
  persons?: string[]
  events?: string[]
  notes?: string[]
  documents?: string[]
  favorite?: boolean
  isEphemeral?: boolean
  createdAt?: string | Date
  completedAt?: string | Date
  completedOn?: string
  completers?: TaskCompleter[]
  dueDate?: string | Date
  budget?: number | string
  visibility?: string
  quality?: number
  redacted?: boolean
}

/**
 * Ephemeral tasks structure with open and closed arrays
 */
export interface EphemeralTasks {
  open: Task[]
  closed: Task[]
}

/**
 * Date bucket structure for completed tasks
 */
export interface DateBucket {
  openTasks: Task[]
  closedTasks: Task[]
  completion: number
}

/**
 * Year bucket mapping dates to date buckets
 */
export type YearBucket = Record<string, DateBucket | Task[]>

/**
 * Completed tasks structure mapping years to date data
 */
export type CompletedTasks = Record<number, YearBucket>

/**
 * TaskList entity from the database
 */
export interface TaskList {
  id: string
  role?: string | null
  name?: string | null
  budget?: number | string | null
  budgetPercentage?: number | null
  remainingBudget?: string | null
  dueDate?: string | Date | null
  visibility?: string
  users?: TaskListMembership[]
  templateId?: string | null
  templateTasks?: Task[]
  tasks?: Task[]
  ephemeralTasks?: EphemeralTasks
  completedTasks?: CompletedTasks
  createdAt?: Date
  updatedAt?: Date
  template?: Template | null
}

/**
 * Template entity from the database
 */
export interface Template {
  id: string
  role?: string | null
  tasks?: Task[]
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Day entity from the database
 */
export interface Day {
  id: string
  userId: string
  date: string
  week?: number
  month?: number
  quarter?: number
  semester?: number
  tasks?: Task[]
  ticker?: TickerEntry[]
  productivity?: Productivity
  progress?: number
  balance?: number
  stash?: number
  equity?: number
}

/**
 * Ticker entry for tracking earnings per task
 */
export interface TickerEntry {
  listId: string
  taskId?: string
  profit: number
  prize: number
}

/**
 * POST request body for tasklist operations
 */
export interface TaskListPostBody {
  role?: string
  tasks?: Task[]
  templateId?: string | null
  updateTemplate?: boolean
  name?: string
  budget?: number | string
  budgetPercentage?: number
  dueDate?: string | Date
  create?: boolean
  collaborators?: string[]
  updateTaskRedacted?: boolean
  deleteTaskList?: boolean
  taskListId?: string
  recordCompletions?: boolean
  dayActions?: Task[]
  weekActions?: Task[]
  justCompletedNames?: string[]
  justUncompletedNames?: string[]
  date?: string
  updateTaskCompletion?: boolean
  taskId?: string
  taskKey?: string
  status?: string
  count?: number
  times?: number
  isCompleted?: boolean
  isUncompleted?: boolean
  ephemeralTasks?: EphemeralTasksOps
  updateTaskStatus?: boolean
  taskStatus?: string
  redacted?: boolean
}

/**
 * Ephemeral tasks operations
 */
export interface EphemeralTasksOps {
  add?: Task
  close?: EphemeralCloseOp | EphemeralCloseOp[]
  update?: EphemeralUpdateOp | EphemeralUpdateOp[]
  reopen?: EphemeralReopenOp | EphemeralReopenOp[]
}

export interface EphemeralCloseOp {
  id: string
  count?: number
}

export interface EphemeralUpdateOp {
  id: string
  name?: string
  count?: number
  status?: string
}

export interface EphemeralReopenOp {
  id: string
  count?: number
}

/**
 * Aggregated earnings result
 */
export interface AggregatedEarnings {
  earnings: number
  prize: number
  profit: number
}

/**
 * Stash and profit deltas
 */
export interface StashProfitDeltas {
  stashDelta: number
  profitDelta: number
}

/**
 * Productivity update result
 */
export interface ProductivityUpdateResult {
  productivity: Productivity
  progress: number
}

/**
 * Task sanitization allowed keys
 */
export const TASK_ALLOWED_KEYS = [
  'id',
  'name',
  'categories',
  'area',
  'status',
  'cadence',
  'times',
  'count',
  'localeKey',
  'contacts',
  'things',
  'favorite',
  'isEphemeral',
  'createdAt',
  'completers',
  'redacted'
] as const
