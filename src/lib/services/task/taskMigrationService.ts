/**
 * Task Migration Service
 * Handles on-the-fly migration of old embedded tasks to the new Task collection
 */

import prisma from '@/lib/prisma'
import type { Task as PrismaTask, Job as PrismaJob, Areas, Category, TaskStatus } from '@/generated/prisma'
import type {
  MigrationMetadata,
  MigrationResult,
  EmbeddedTask,
  EmbeddedCompleter,
  RecurrenceRule,
  MigrateListTasksParams,
  MigrateEmbeddedTaskParams,
  MigrateCompletersParams
} from './types'

/**
 * Get a unique key for task matching
 * Priority: localeKey > id > name (lowercase)
 */
export function getTaskMatchKey(task: EmbeddedTask | PrismaTask | null | undefined): string {
  if (!task) return ''
  // For Prisma Task, localeKey is a field
  const localeKey = (task as any).localeKey
  if (localeKey) return localeKey
  // Fall back to id or name
  if (task.id) return task.id
  if (typeof task.name === 'string') return task.name.toLowerCase()
  return ''
}

/**
 * Check if a task has already been migrated
 */
export function isTaskMigrated(
  migrationMetadata: MigrationMetadata | null | undefined,
  taskKey: string
): boolean {
  if (!migrationMetadata || !migrationMetadata.migratedTaskKeys) return false
  return migrationMetadata.migratedTaskKeys.includes(taskKey)
}

/**
 * Determine recurrence rule based on list role
 */
export function getRecurrenceFromListRole(listRole: string | null | undefined): RecurrenceRule | null {
  if (!listRole) return null

  if (listRole.startsWith('daily')) {
    return {
      frequency: 'DAILY',
      interval: 1,
      byWeekday: [],
      byMonthDay: [],
      byMonth: []
    }
  }

  if (listRole.startsWith('weekly')) {
    return {
      frequency: 'WEEKLY',
      interval: 1,
      byWeekday: [],
      byMonthDay: [],
      byMonth: []
    }
  }

  // One-off or custom lists don't have recurrence
  return null
}

/**
 * Map old string status to TaskStatus enum
 */
function mapToTaskStatus(status: string | undefined): TaskStatus {
  if (!status) return 'OPEN'

  const statusMap: Record<string, TaskStatus> = {
    'open': 'OPEN',
    'in progress': 'IN_PROGRESS',
    'in_progress': 'IN_PROGRESS',
    'steady': 'STEADY',
    'ready': 'READY',
    'done': 'DONE',
    'ignored': 'IGNORED',
    'skipped': 'SKIPPED'
  }

  return statusMap[status.toLowerCase()] || 'OPEN'
}

/**
 * Map old string area to Areas enum
 */
function mapToAreas(area: string | undefined): Areas {
  if (!area) return 'self'

  const areaMap: Record<string, Areas> = {
    'self': 'self',
    'home': 'home',
    'social': 'social',
    'work': 'work'
  }

  return areaMap[area.toLowerCase()] || 'self'
}

/**
 * Map old categories to Category enum
 */
function mapToCategories(categories: string[] | undefined): Category[] {
  if (!categories || !Array.isArray(categories)) return []

  const categoryMap: Record<string, Category> = {
    'body': 'body',
    'spirituality': 'spirituality',
    'fun': 'fun',
    'extra': 'extra',
    'clean': 'clean',
    'affection': 'affection',
    'maintenance': 'maintenance',
    'community': 'community',
    'growth': 'growth',
    'work': 'work',
    'mind': 'mind',
    'spirit': 'spirit',
    'social': 'social',
    'home': 'home',
    'custom': 'custom',
    'event': 'event'
  }

  return categories
    .map(c => categoryMap[c.toLowerCase()])
    .filter((c): c is Category => c !== undefined)
}

/**
 * Migrate a single embedded task to the Task collection
 */
export async function migrateEmbeddedTask({
  embeddedTask,
  listId,
  listRole,
  userId
}: MigrateEmbeddedTaskParams): Promise<{ task: PrismaTask; jobs: PrismaJob[] }> {
  // Determine recurrence based on list role
  const recurrence = embeddedTask.recurrence || getRecurrenceFromListRole(listRole)

  // Create the Task record
  const task = await prisma.task.create({
    data: {
      name: embeddedTask.name,
      categories: mapToCategories(embeddedTask.categories),
      area: mapToAreas(embeddedTask.area),
      status: mapToTaskStatus(embeddedTask.status),
      listId,
      recurrence: recurrence as any,
      nextOccurrence: embeddedTask.nextOccurrence ? new Date(embeddedTask.nextOccurrence) : null,
      lastOccurrence: embeddedTask.lastOccurrence ? new Date(embeddedTask.lastOccurrence) : null,
      firstOccurrence: embeddedTask.firstOccurrence ? new Date(embeddedTask.firstOccurrence) : null,
      times: embeddedTask.times || 1,
      count: embeddedTask.count || 0,
      localeKey: embeddedTask.localeKey || null,
      persons: (embeddedTask.persons || []) as any,
      things: (embeddedTask.things || []) as any,
      events: (embeddedTask.events || []) as any,
      notes: (embeddedTask.notes || []) as any,
      documents: (embeddedTask.documents || []) as any,
      completedOn: embeddedTask.completedOn || null,
      dueDate: embeddedTask.dueDate ? new Date(embeddedTask.dueDate) : null,
      budget: embeddedTask.budget || null,
      visibility: embeddedTask.visibility as any || null,
      quality: embeddedTask.quality || null,
      redacted: embeddedTask.redacted || false
    }
  })

  // Migrate completers to Job records
  const jobs: PrismaJob[] = []
  if (embeddedTask.completers && embeddedTask.completers.length > 0) {
    const migratedJobs = await migrateCompletersToJobs({
      taskId: task.id,
      listId,
      completers: embeddedTask.completers
    })
    jobs.push(...migratedJobs)
  }

  return { task, jobs }
}

/**
 * Migrate completers array to Job records
 */
export async function migrateCompletersToJobs({
  taskId,
  listId,
  completers
}: MigrateCompletersParams): Promise<PrismaJob[]> {
  const jobs: PrismaJob[] = []

  for (const completer of completers) {
    // Validate completer has required fields
    if (!completer.id) continue

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: completer.id },
      select: { id: true }
    })

    if (!user) {
      console.warn(`Skipping completer migration: user ${completer.id} not found`)
      continue
    }

    // Create Job record for this completion
    const job = await prisma.job.create({
      data: {
        taskId,
        listId,
        workerId: completer.id,
        status: 'ACCEPTED', // Historical completions are auto-accepted
        selfReview: completer.earnings ? 5 : null, // If they had earnings, assume good review
        createdAt: completer.completedAt ? new Date(completer.completedAt) : new Date()
      }
    })

    jobs.push(job)
  }

  return jobs
}

/**
 * Migrate all tasks from a list's templateTasks to the Task collection
 */
export async function migrateListTasks({
  listId,
  userId,
  taskKeys
}: MigrateListTasksParams): Promise<MigrationResult> {
  const result: MigrationResult = {
    tasksCreated: 0,
    jobsCreated: 0,
    skipped: 0,
    errors: [],
    migratedTasks: []
  }

  // Fetch the list with templateTasks
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: {
      id: true,
      role: true,
      templateTasks: true,
      migrationMetadata: true,
      users: true
    }
  })

  if (!list) {
    result.errors.push(`List ${listId} not found`)
    return result
  }

  // Parse existing migration metadata
  const existingMetadata = (list.migrationMetadata as MigrationMetadata) || {
    migratedTaskKeys: [],
    completedMigration: false
  }

  // Get tasks to migrate
  const templateTasks = (list.templateTasks || []) as unknown as EmbeddedTask[]
  const ephemeralOpenTasks = (list.ephemeralTasks?.open || []) as unknown as EmbeddedTask[]
  const ephemeralClosedTasks = (list.ephemeralTasks?.closed || []) as unknown as EmbeddedTask[]
  const tasksToMigrate = taskKeys
    ? [...templateTasks, ...ephemeralOpenTasks, ...ephemeralClosedTasks].filter(t => {
        const key = getTaskMatchKey(t)
        return key && taskKeys.includes(key)
      })
    : templateTasks

  // Track newly migrated task keys
  const newlyMigratedKeys: string[] = []

  for (const embeddedTask of tasksToMigrate) {
    const taskKey = getTaskMatchKey(embeddedTask)

    if (!taskKey) {
      result.errors.push(`Task without key: ${JSON.stringify(embeddedTask).slice(0, 100)}`)
      result.skipped++
      continue
    }

    // Skip if already migrated
    if (isTaskMigrated(existingMetadata, taskKey)) {
      result.skipped++
      continue
    }

    // Check if task already exists in collection (by localeKey or name)
    // Build OR conditions, only including localeKey if it exists
    const orConditions: any[] = []

    if (embeddedTask.localeKey) {
      orConditions.push({ localeKey: embeddedTask.localeKey })
    }

    // Always check by name as fallback
    orConditions.push({ name: embeddedTask.name })

    const existingTask = await prisma.task.findFirst({
      where: {
        listId,
        OR: orConditions
      }
    })

    if (existingTask) {
      // Mark as migrated to avoid duplicate attempts
      newlyMigratedKeys.push(taskKey)
      result.skipped++
      continue
    }

    try {
      const { task, jobs } = await migrateEmbeddedTask({
        embeddedTask,
        listId,
        listRole: list.role,
        userId
      })

      result.tasksCreated++
      result.jobsCreated += jobs.length
      result.migratedTasks.push(task)
      newlyMigratedKeys.push(taskKey)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push(`Failed to migrate task ${taskKey}: ${errorMsg}`)
    }
  }

  // Update migration metadata on the list
  const updatedMetadata: MigrationMetadata = {
    migratedTaskKeys: [...existingMetadata.migratedTaskKeys, ...newlyMigratedKeys],
    completedMigration: !taskKeys && result.errors.length === 0,
    migratedAt: new Date().toISOString(),
    lastMigrationError: result.errors.length > 0 ? result.errors[result.errors.length - 1] : undefined
  }

  await prisma.list.update({
    where: { id: listId },
    data: {
      migrationMetadata: updatedMetadata as any
    }
  })

  return result
}

/**
 * Check if a list needs migration
 */
export async function listNeedsMigration(listId: string): Promise<{
  needsMigration: boolean
  legacyTaskCount: number
  migratedTaskCount: number
}> {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: {
      templateTasks: true,
      migrationMetadata: true,
      _count: {
        select: { tasks: true }
      }
    }
  })

  if (!list) {
    return { needsMigration: false, legacyTaskCount: 0, migratedTaskCount: 0 }
  }

  const templateTasks = (list.templateTasks || []) as unknown as EmbeddedTask[]
  const metadata = list.migrationMetadata as MigrationMetadata | null

  // Check if migration is already complete
  if (metadata?.completedMigration) {
    return {
      needsMigration: false,
      legacyTaskCount: templateTasks.length,
      migratedTaskCount: list._count.tasks
    }
  }

  // Check if there are tasks to migrate
  const unmigratedCount = templateTasks.filter(t => {
    const key = getTaskMatchKey(t)
    return key && !isTaskMigrated(metadata, key)
  }).length

  return {
    needsMigration: unmigratedCount > 0,
    legacyTaskCount: templateTasks.length,
    migratedTaskCount: list._count.tasks
  }
}
