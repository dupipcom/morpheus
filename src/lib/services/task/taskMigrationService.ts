/**
 * Task Migration Service
 * Handles on-the-fly migration of old embedded tasks to the new Task collection
 */

import prisma from '@/lib/prisma'
import type { Task as PrismaTask, Job as PrismaJob, Areas, Category, TaskStatus } from '@/generated/prisma'
import type { BudgetDistribution } from '@/lib/utils/budgetDistributionUtils'
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
 * Partial list data needed for budget calculations
 */
interface ListForBudgetCalculation {
  budget?: number | null
  budgetDistribution?: BudgetDistribution | null
  prizePercentage?: number | null
  tasks?: any[]
  templateTasks?: any[]
}

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
 * Calculate task budget allocations from list's budget distribution
 * Returns { budget, prize, premium } for a specific task
 */
export function calculateTaskBudgetFromDistribution(params: {
  task: EmbeddedTask | PrismaTask
  list: ListForBudgetCalculation
  taskIndex?: number
}): { budget: number | null; prize: number | null; premium: number | null } {
  const { task, list, taskIndex = 0 } = params
  
  const listBudget = list.budget || 0
  const budgetDistribution = list.budgetDistribution
  const prizePercentage = list.prizePercentage || 0
  
  let budget: number | null = null
  let prize: number | null = null
  
  // PRIORITY 1: Check for custom per-task allocation in budgetDistribution
  // This takes precedence over any stored values in the task object
  if (budgetDistribution?.tasks && task.id && budgetDistribution.tasks[task.id]) {
    budget = budgetDistribution.tasks[task.id].budget || 0
    prize = budgetDistribution.tasks[task.id].prize || 0
  }
  // PRIORITY 2: Use area-based distribution
  else if (budgetDistribution?.areas && task.area) {
    const areaPercentage = budgetDistribution.areas[task.area] || 0
    const areaBudget = (listBudget * areaPercentage) / 100
    // Count tasks in same area to split budget
    const tasksInArea = (list.tasks || list.templateTasks || []).filter((t: any) => t.area === task.area).length || 1
    budget = areaBudget / tasksInArea
    
    // Calculate prize for this area
    const totalPrizeBudget = (listBudget * prizePercentage) / 100
    const areaPrizeBudget = (totalPrizeBudget * areaPercentage) / 100
    prize = areaPrizeBudget / tasksInArea
  }
  // PRIORITY 3: Use category-based distribution
  else if (budgetDistribution?.categories && task.categories && task.categories.length > 0) {
    // Average across all categories this task belongs to
    let totalBudget = 0
    let totalPrize = 0
    const taskCategories = Array.isArray(task.categories) ? task.categories : [task.categories]
    
    taskCategories.forEach((category: any) => {
      const categoryPercentage = budgetDistribution.categories[category] || 0
      const categoryBudget = (listBudget * categoryPercentage) / 100
      const tasksInCategory = (list.tasks || list.templateTasks || []).filter((t: any) => 
        Array.isArray(t.categories) ? t.categories.includes(category) : t.categories === category
      ).length || 1
      totalBudget += categoryBudget / tasksInCategory
      
      // Calculate prize for this category
      const totalPrizeBudget = (listBudget * prizePercentage) / 100
      const categoryPrizeBudget = (totalPrizeBudget * categoryPercentage) / 100
      totalPrize += categoryPrizeBudget / tasksInCategory
    })
    
    budget = totalBudget / taskCategories.length
    prize = totalPrize / taskCategories.length
  }
  // PRIORITY 4: If budgetDistribution exists but task doesn't match any mode, use equal split
  // This ensures we always use the distribution if it's configured
  else if (budgetDistribution && listBudget > 0) {
    const totalTasks = (list.tasks || list.templateTasks || []).length || 1
    const earningsBudget = listBudget * (1 - prizePercentage / 100)
    const prizeBudget = listBudget * (prizePercentage / 100)
    budget = earningsBudget / totalTasks
    prize = prizeBudget / totalTasks
  }
  // PRIORITY 5: If task has stored budget/prize AND no budgetDistribution is configured, use stored values
  // This is for backward compatibility with lists that don't have distribution configured yet
  else if ((task as any).budget != null || (task as any).prize != null) {
    budget = (task as any).budget || 0
    prize = (task as any).prize || 0
  }
  // PRIORITY 6: Default equal distribution (legacy behavior)
  else if (listBudget > 0) {
    const totalTasks = (list.tasks || list.templateTasks || []).length || 1
    const earningsBudget = listBudget * (1 - prizePercentage / 100)
    const prizeBudget = listBudget * (prizePercentage / 100)
    budget = earningsBudget / totalTasks
    prize = prizeBudget / totalTasks
  }
  
  // Calculate premium and apply safety caps
  const calculatedPremium = (budget || 0) + (prize || 0)
  
  // If task has a stored premium value, ensure we never exceed it
  // This is a critical safety check to prevent awarding more than allocated
  if ((task as any).premium != null && (task as any).premium > 0) {
    const storedPremium = (task as any).premium
    if (calculatedPremium > storedPremium) {
      // Scale down proportionally to fit within the stored premium
      const scaleFactor = storedPremium / calculatedPremium
      budget = budget ? budget * scaleFactor : null
      prize = prize ? prize * scaleFactor : null
    }
  }
  
  const premium = (budget || 0) + (prize || 0)
  
  return {
    budget: budget ? Math.round(budget * 100) / 100 : null,
    prize: prize ? Math.round(prize * 100) / 100 : null,
    premium: premium > 0 ? Math.round(premium * 100) / 100 : null
  }
}

/**
 * Migrate a single embedded task to the Task collection
 */
export async function migrateEmbeddedTask({
  embeddedTask,
  listId,
  listRole,
  userId,
  list
}: MigrateEmbeddedTaskParams): Promise<{ task: PrismaTask; jobs: PrismaJob[] }> {
  // Determine recurrence based on list role
  const recurrence = embeddedTask.recurrence || getRecurrenceFromListRole(listRole)

  // Calculate budget allocations from list's budget distribution
  let budgetAllocation = { budget: null as number | null, prize: null as number | null, premium: null as number | null }
  if (list) {
    budgetAllocation = calculateTaskBudgetFromDistribution({ task: embeddedTask, list })
  }

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
      budget: budgetAllocation.budget ?? embeddedTask.budget ?? null,
      prize: budgetAllocation.prize ?? (embeddedTask as any).prize ?? null,
      premium: budgetAllocation.premium ?? null,
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
        userId,
        list
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
