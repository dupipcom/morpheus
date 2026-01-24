/**
 * TaskList CRUD service
 * Handles create, read, update, delete operations for task lists
 */

import prisma from '@/lib/prisma'
import { recalculateUserBudget } from '@/lib/utils/budgetUtils'
import { getProfitPerTask } from '@/lib/utils/earningsUtils'
import { BudgetDistribution } from '@/lib/utils/budgetDistributionUtils'
import type { Task, TaskList, TaskListMembership, CompletedTasks } from './types'
import {
  ensureUniqueTaskIds,
  translateTemplateTasks,
  getLocalizedListName,
  parseNumericValue
} from './helpers'

/**
 * Get task lists for a user
 */
export async function getTaskListsForUser(params: {
  userId: string
  role?: string | null
}): Promise<TaskList[]> {
  const { userId, role } = await params

  // Find user by userId
  const user = await prisma.user.findUnique({
    where: { userId: userId }
  })

  if (!user) {
    throw new Error('User not found')
  }

  // Build query for TaskLists where the user participates
  const membershipClause = {
    OR: [
      { users: { some: { userId: user.id, role: 'OWNER' } } },
      { users: { some: { userId: user.id, role: 'COLLABORATOR' } } },
      { users: { some: { userId: user.id, role: 'MANAGER' } } }
    ]
  }

  const whereClause = role ? { role, ...membershipClause } : membershipClause

  const taskLists = await prisma.list?.findMany({
    where: whereClause,
    include: {
      template: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  })

  return taskLists as unknown as TaskList[]
}

/**
 * Calculate collaborator earnings for task lists
 */
export async function calculateCollaboratorEarnings(
  taskLists: TaskList[]
): Promise<(TaskList & { collaboratorEarnings: Record<string, number> })[]> {
  return Promise.all(taskLists.map(async (taskList) => {
    const collaboratorEarnings: Record<string, number> = {}

    const users = (taskList.users as TaskListMembership[]) || []
    const collaborators = users
      .filter((u) => u.role === 'COLLABORATOR' || u.role === 'MANAGER')
      .map((u) => u.userId)
    const owners = users.filter((u) => u.role === 'OWNER').map((u) => u.userId)

    if (collaborators.length > 0) {
      const completedTasks = (taskList.completedTasks as CompletedTasks) || {}
      const allCollaborators = [...owners, ...collaborators]

      // Get user profiles to map userId to userName
      const userProfiles = await prisma.user.findMany({
        where: {
          id: { in: allCollaborators }
        },
        include: {
          profiles: true
        }
      })

      const userIdToUserName: Record<string, string> = {}
      userProfiles.forEach((u) => {
        const profile = Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null
        userIdToUserName[u.id] = (profile?.data as Record<string, { value?: string }>)?.username?.value || u.id
      })

      // Calculate profit per task
      const listBudget = taskList.budget
      const listRole = taskList.role
      const totalTasks = (taskList.tasks as Task[])?.length || (taskList.templateTasks as Task[])?.length || 1
      const profitPerTask = getProfitPerTask(listBudget as number | string | null, totalTasks, listRole)

      // Iterate through all completed tasks to sum earnings per user
      for (const year in completedTasks) {
        const yearData = completedTasks[Number(year)]
        for (const date in yearData) {
          const dateBucket = yearData[date]
          let tasksForDate: Task[] = []

          // Support both old structure (array) and new structure
          if (Array.isArray(dateBucket)) {
            tasksForDate = dateBucket
          } else if (dateBucket && ('openTasks' in dateBucket || 'closedTasks' in dateBucket)) {
            const bucket = dateBucket as { openTasks?: Task[]; closedTasks?: Task[] }
            tasksForDate = [
              ...(Array.isArray(bucket.openTasks) ? bucket.openTasks : []),
              ...(Array.isArray(bucket.closedTasks) ? bucket.closedTasks : [])
            ]
          }

          tasksForDate.forEach((task) => {
            if (Array.isArray(task.completers)) {
              task.completers.forEach((completer) => {
                const cUserId = completer.id
                const userName = userIdToUserName[cUserId] || cUserId

                if (!collaboratorEarnings[userName]) {
                  collaboratorEarnings[userName] = 0
                }
                collaboratorEarnings[userName] += profitPerTask
              })
            }
          })
        }
      }
    }

    return {
      ...taskList,
      collaboratorEarnings
    }
  }))
}

/**
 * Ensure default task lists exist for a user
 */
export async function ensureDefaultTaskLists(params: {
  userId: string
  userInternalId: string
  translations: Record<string, unknown>
}): Promise<void> {
  const { userId, userInternalId, translations } = await params

  const ensureDefault = async (role: string): Promise<void> => {
    const existing = await prisma.list.findFirst({
      where: { users: { some: { userId: userInternalId, role: 'OWNER' } }, role: role }
    })

    if (!existing) {
      const tpl = await prisma.template.findFirst({ where: { role: role } })
      const localizedName = getLocalizedListName(role, translations)

      // Translate template tasks if they exist
      let translatedTasks = (tpl?.tasks as Task[]) || []
      if (translatedTasks.length > 0) {
        translatedTasks = translateTemplateTasks(translatedTasks, translations)
        translatedTasks = ensureUniqueTaskIds(translatedTasks, true)
      }

      await prisma.list.create({
        data: {
          role: role,
          name: localizedName,
          visibility: 'PRIVATE',
          users: [{ userId: userInternalId, role: 'OWNER' }],
          templateId: tpl?.id || null,
          templateTasks: translatedTasks,
          // Note: tasks relation is not set here - the migration system will create Task records from templateTasks
        } as Record<string, unknown>
      })
    }
  }

  await ensureDefault('daily.default')
  await ensureDefault('weekly.default')
}

/**
 * Delete a task list
 */
export async function deleteTaskList(params: {
  taskListId: string
  userId: string
}): Promise<void> {
  const { taskListId, userId } = await params

  const existing = await prisma.list.findUnique({ where: { id: taskListId } })
  if (!existing) {
    throw new Error('TaskList not found')
  }

  await prisma.list.delete({ where: { id: taskListId } })

  // Recalculate user's budget after deleting a list
  await recalculateUserBudget(userId)
}

/**
 * Create a new task list
 */
export async function createTaskList(params: {
  userId: string
  role?: string
  name?: string
  budget?: number
  budgetPercentage?: number
  prizePercentage?: number
  budgetDistribution?: BudgetDistribution
  dueDate?: string | Date
  templateId?: string | null
  tasks?: Task[]
  collaborators?: string[]
}): Promise<TaskList> {
  const { userId, role, name, budget, budgetPercentage, prizePercentage, budgetDistribution, dueDate, templateId, tasks, collaborators } = await params

  // If creating a new default list, demote existing default to custom
  if (role && role.endsWith('.default')) {
    const existingDefault = await prisma.list.findFirst({
      where: {
        users: { some: { userId: userId, role: 'OWNER' } },
        role: role
      }
    })

    if (existingDefault) {
      await prisma.list.update({
        where: { id: existingDefault.id },
        data: { role: 'custom' }
      })
    }
  }

  const taskList = await prisma.list.create({
    data: {
      role: role,
      name: name,
      budget: budget,
      budgetPercentage: budgetPercentage || 0,
      prizePercentage: prizePercentage || 0,
      budgetDistribution: budgetDistribution,
      dueDate: dueDate,
      visibility: 'PRIVATE',
      users: [
        { userId: userId, role: 'OWNER' },
        ...(Array.isArray(collaborators) ? collaborators.map((id) => ({ userId: id, role: 'COLLABORATOR' as const })) : [])
      ],
      templateTasks: tasks,
      // Note: tasks relation is not set here - the migration system will create Task records from templateTasks
      templateId: templateId
    } as Record<string, unknown>,
    include: { template: true }
  })

  // Recalculate user's budget if budgetPercentage was set
  if (budgetPercentage) {
    await recalculateUserBudget(userId)
  }

  return taskList as unknown as TaskList
}

/**
 * Update an existing task list
 */
export async function updateTaskList(params: {
  taskListId: string
  userId: string
  role?: string
  name?: string
  budget?: number
  budgetPercentage?: number
  prizePercentage?: number
  budgetDistribution?: BudgetDistribution
  dueDate?: string | Date
  templateId?: string | null
  tasks?: Task[]
  collaborators?: string[]
}): Promise<TaskList> {
  const { taskListId, userId, role, name, budget, budgetPercentage, prizePercentage, budgetDistribution, dueDate, templateId, tasks, collaborators } = await params

  const existing = await prisma.list.findUnique({ where: { id: taskListId } })
  if (!existing) {
    throw new Error('TaskList not found')
  }

  // Ensure all tasks have unique ObjectIds and strip fields not in EmbeddedTask type
  let updatedTasks = tasks
  if (Array.isArray(updatedTasks)) {
    updatedTasks = ensureUniqueTaskIds(updatedTasks, !!templateId)
    // Strip fields that aren't part of EmbeddedTask type (timestamps, prize, premium, listId)
    // EmbeddedTask only has: id, name, categories, area, status, recurrence, times, count, etc.
    // It does NOT have: updatedAt, createdAt, prize, premium, listId (these are only in Task model)
    updatedTasks = updatedTasks.map(task => {
      const { updatedAt, createdAt, prize, premium, listId, ...taskWithoutExtraFields } = task as Task & { 
        updatedAt?: unknown
        createdAt?: unknown
        prize?: unknown
        premium?: unknown
        listId?: unknown
      }
      return taskWithoutExtraFields
    })
  }

  const updated = await prisma.list.update({
    where: { id: existing.id },
    data: {
      templateTasks: updatedTasks ?? existing.templateTasks,
      // Note: We don't update the tasks relation here - use the Task API to manage Task records
      templateId: templateId !== undefined ? templateId : existing.templateId,
      role: typeof role === 'string' ? role : existing.role,
      name: name !== undefined ? name : existing.name,
      budget: budget !== undefined ? budget : existing.budget,
      budgetPercentage: budgetPercentage !== undefined ? budgetPercentage : (existing as Record<string, unknown>).budgetPercentage,
      prizePercentage: prizePercentage !== undefined ? prizePercentage : (existing as Record<string, unknown>).prizePercentage,
      budgetDistribution: budgetDistribution !== undefined ? budgetDistribution : (existing as Record<string, unknown>).budgetDistribution,
      dueDate: dueDate !== undefined ? dueDate : existing.dueDate,
      users: Array.isArray(collaborators)
        ? [
            ...((existing.users as TaskListMembership[]) || []).filter((u) => u.role === 'OWNER'),
            ...collaborators.map((id) => ({ userId: id, role: 'COLLABORATOR' as const }))
          ]
        : existing.users
    } as Record<string, unknown>,
    include: { template: true }
  })

  // Recalculate user's budget if budgetPercentage was updated
  if (budgetPercentage !== undefined) {
    await recalculateUserBudget(userId)
  }

  return updated as unknown as TaskList
}

/**
 * Update template with tasks
 */
export async function updateTemplateWithTasks(params: {
  templateId: string
  tasks: Task[]
}): Promise<void> {
  const { templateId, tasks } = await params

  await prisma.template.update({
    where: { id: templateId },
    data: {
      tasks: tasks
    }
  })
}

/**
 * Get a task list with its template
 */
export async function getTaskListWithTemplate(taskListId: string): Promise<TaskList | null> {
  const taskList = await prisma.list.findUnique({
    where: { id: taskListId },
    include: { template: true }
  })

  return taskList as unknown as TaskList | null
}
