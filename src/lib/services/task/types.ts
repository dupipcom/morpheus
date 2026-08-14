/**
 * TypeScript interfaces for the Task migration service layer
 */

import type { Task as PrismaTask, Job as PrismaJob, RecurrenceFrequency } from '@/generated/prisma/client'
import type { BudgetDistribution } from '@/lib/utils/budgetDistributionUtils'

/**
 * Migration metadata stored on List model
 */
export interface MigrationMetadata {
  migratedTaskKeys: string[]
  completedMigration: boolean
  migratedAt?: string
  lastMigrationError?: string
}

/**
 * Result of a migration operation
 */
export interface MigrationResult {
  tasksCreated: number
  jobsCreated: number
  skipped: number
  errors: string[]
  migratedTasks: PrismaTask[]
}

/**
 * Completer entry from old embedded tasks
 */
export interface EmbeddedCompleter {
  id: string
  earnings?: number
  premium?: number
  time?: number
  completedAt?: Date | string
}

/**
 * Old embedded task structure from List.templateTasks
 */
export interface EmbeddedTask {
  id?: string
  name: string
  categories?: string[]
  area?: string
  status?: string
  recurrence?: RecurrenceRule | null
  nextOccurrence?: Date | string | null
  lastOccurrence?: Date | string | null
  firstOccurrence?: Date | string | null
  times?: number
  count?: number
  localeKey?: string
  persons?: any[]
  things?: any[]
  events?: any[]
  notes?: any[]
  documents?: any[]
  createdAt?: string
  completedOn?: string
  dueDate?: Date | string | null
  budget?: number
  earnings?: number
  premium?: number
  totalGains?: number
  visibility?: string
  quality?: number
  redacted?: boolean
  completers?: EmbeddedCompleter[]
}

/**
 * Recurrence rule for tasks
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval?: number
  byWeekday?: number[]
  byMonthDay?: number[]
  byMonth?: number[]
  endDate?: Date | string | null
  occurrenceCount?: number
}

/**
 * Parameters for migrating a list's tasks
 */
export interface MigrateListTasksParams {
  listId: string
  userId: string
  taskKeys?: string[]
}

/**
 * Parameters for migrating a single embedded task
 */
export interface MigrateEmbeddedTaskParams {
  embeddedTask: EmbeddedTask
  listId: string
  listRole: string | null
  userId: string
  list?: ListForBudgetCalculation // Optional list object for budget calculations
}

interface ListForBudgetCalculation {
  budget?: number | null
  budgetDistribution?: BudgetDistribution | null
  premiumPercentage?: number | null
  tasks?: any[]
  // templateTasks is deprecated - using Task collection only
}

/**
 * Parameters for migrating completers to jobs
 */
export interface MigrateCompletersParams {
  taskId: string
  listId: string
  completers: EmbeddedCompleter[]
}
