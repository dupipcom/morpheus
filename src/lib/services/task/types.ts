/**
 * TypeScript interfaces for the Task service layer
 */

import type { Task as PrismaTask } from '@/generated/prisma'

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
 * Parameters for migrating a list's tasks
 */
export interface MigrateListTasksParams {
  listId: string
  userId: string
  taskKeys?: string[]
}
