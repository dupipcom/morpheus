/**
 * TaskList CRUD service
 * Handles create, read, update, delete operations for task lists
 */

import prisma from '@/lib/prisma'
import { recalculateUserBudget } from '@/lib/utils/budgetUtils'
import { getProfitPerTask } from '@/lib/utils/earningsUtils'
import { BudgetDistribution } from '@/lib/utils/budgetDistributionUtils'
import { refreshListTaskValues } from '@/lib/services/task/taskValueRefreshService'
import type { Task, TaskList, TaskListMembership, CompletedTasks } from './types'
import {
  ensureUniqueTaskIds,
  translateTemplateTasks,
  getLocalizedListName,
  parseNumericValue
} from './helpers'

/**
 * Get task lists for a user
 * Includes tasks from the Task collection (templateTasks is deprecated)
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
      template: true,
      tasks: true  // Include tasks from Task collection
    },
    orderBy: {
      createdAt: 'asc'
    }
  })

  return taskLists as unknown as TaskList[]
}

/**
 * Calculate collaborator earnings for task lists
 * Optimized to batch user profile fetching to avoid N+1 queries
 */
export async function calculateCollaboratorEarnings(
  taskLists: TaskList[]
): Promise<(TaskList & { collaboratorEarnings: Record<string, number> })[]> {
  // Batch all user IDs from all task lists to avoid N+1 queries
  const allUserIds = new Set<string>()
  taskLists.forEach((taskList) => {
    const users = (taskList.users as TaskListMembership[]) || []
    const collaborators = users
      .filter((u) => u.role === 'COLLABORATOR' || u.role === 'MANAGER')
      .map((u) => u.userId)
    const owners = users.filter((u) => u.role === 'OWNER').map((u) => u.userId)
    
    if (collaborators.length > 0) {
      [...owners, ...collaborators].forEach((id) => allUserIds.add(id))
    }
  })

  // Single batched query for all user profiles
  let userIdToUserName: Record<string, string> = {}
  if (allUserIds.size > 0) {
    const userProfiles = await prisma.user.findMany({
      where: {
        id: { in: Array.from(allUserIds) }
      },
      include: {
        profiles: true
      }
    })

    userProfiles.forEach((u) => {
      const profile = Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null
      userIdToUserName[u.id] = (profile?.data as Record<string, { value?: string }>)?.username?.value || u.id
    })
  }

  // Now process each task list without additional database queries
  return taskLists.map((taskList) => {
    const collaboratorEarnings: Record<string, number> = {}

    const users = (taskList.users as TaskListMembership[]) || []
    const collaborators = users
      .filter((u) => u.role === 'COLLABORATOR' || u.role === 'MANAGER')
      .map((u) => u.userId)

    if (collaborators.length > 0) {
      const completedTasks = (taskList.completedTasks as CompletedTasks) || {}

      // Calculate profit per task (templateTasks is deprecated)
      const listBudget = taskList.budget
      const listRole = taskList.role
      const totalTasks = (taskList.tasks as Task[])?.length || 1
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
  })
}

/**
 * Ensure default task lists exist for a user
 * Creates Task records in the Task collection (no longer uses templateTasks)
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

      // Create the list first (without templateTasks - deprecated)
      const newList = await prisma.list.create({
        data: {
          role: role,
          name: localizedName,
          visibility: 'PRIVATE',
          users: [{ userId: userInternalId, role: 'OWNER' }],
          templateId: tpl?.id || null,
          // templateTasks is deprecated - we create Task records instead
        } as Record<string, unknown>
      })

      // Build recurrence rule based on role
      let recurrence: { frequency: string; interval: number; byWeekday: number[]; byMonthDay: number[]; byMonth: number[] } | undefined = undefined
      if (role.startsWith('daily')) {
        recurrence = { frequency: 'DAILY', interval: 1, byWeekday: [], byMonthDay: [], byMonth: [] }
      } else if (role.startsWith('weekly')) {
        recurrence = { frequency: 'WEEKLY', interval: 1, byWeekday: [], byMonthDay: [], byMonth: [] }
      }

      // Create Task records in the Task collection
      if (translatedTasks.length > 0) {
        const taskCreatePromises = translatedTasks.map((task) =>
          prisma.task.create({
            data: {
              name: task.name,
              categories: task.categories || [],
              area: task.area || 'self',
              status: 'OPEN',
              listId: newList.id,
              recurrence: recurrence,
              times: task.times || 1,
              localeKey: task.localeKey,
              budget: task.budget,
              visibility: task.visibility,
              quality: task.quality,
              redacted: task.redacted || false,
              persons: task.persons || [],
              things: task.things || [],
              events: task.events || [],
              notes: task.notes || [],
              documents: task.documents || [],
            }
          })
        )
        await Promise.all(taskCreatePromises)
      }
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
 * Creates Task records in the Task collection (no longer uses templateTasks)
 */
export async function createTaskList(params: {
  userId: string
  role?: string
  name?: string
  budget?: number
  premiumPercentage?: number
  budgetDistribution?: BudgetDistribution
  dueDate?: string | Date
  templateId?: string | null
  tasks?: Task[]
  collaborators?: string[]
}): Promise<TaskList> {
  const { userId, role, name, budget, premiumPercentage, budgetDistribution, dueDate, templateId, tasks, collaborators } = await params

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

  // Create the list first (without templateTasks - deprecated)
  const taskList = await prisma.list.create({
    data: {
      role: role,
      name: name,
      budget: budget,
      premiumPercentage: premiumPercentage || 0,
      budgetDistribution: budgetDistribution,
      dueDate: dueDate,
      visibility: 'PRIVATE',
      users: [
        { userId: userId, role: 'OWNER' },
        ...(Array.isArray(collaborators) ? collaborators.map((id) => ({ userId: id, role: 'COLLABORATOR' as const })) : [])
      ],
      // templateTasks is deprecated - we create Task records instead
      templateId: templateId
    } as Record<string, unknown>,
    include: { template: true, tasks: true }
  })

  // Create Task records in the Task collection
  if (Array.isArray(tasks) && tasks.length > 0) {
    const taskCreatePromises = tasks.map((task) => {
      // Build recurrence rule based on list cadence
      let recurrence: { frequency: string; interval: number; byWeekday: number[]; byMonthDay: number[]; byMonth: number[] } | undefined = undefined
      if (role) {
        if (role.startsWith('daily')) {
          recurrence = { frequency: 'DAILY', interval: 1, byWeekday: [], byMonthDay: [], byMonth: [] }
        } else if (role.startsWith('weekly')) {
          recurrence = { frequency: 'WEEKLY', interval: 1, byWeekday: [], byMonthDay: [], byMonth: [] }
        }
      }

      return prisma.task.create({
        data: {
          name: task.name,
          categories: task.categories || [],
          area: task.area || 'self',
          status: 'OPEN',
          listId: taskList.id,
          recurrence: recurrence,
          times: task.times || 1,
          localeKey: task.localeKey,
          budget: task.budget,
          visibility: task.visibility,
          quality: task.quality,
          redacted: task.redacted || false,
          persons: task.persons || [],
          things: task.things || [],
          events: task.events || [],
          notes: task.notes || [],
          documents: task.documents || [],
        }
      })
    })

    await Promise.all(taskCreatePromises)

    // Refresh all task values based on budget distribution
    await refreshListTaskValues(taskList.id)

    // Re-fetch the list with tasks
    const updatedList = await prisma.list.findUnique({
      where: { id: taskList.id },
      include: { template: true, tasks: true }
    })

    if (!updatedList) {
      throw new Error('Failed to fetch created TaskList')
    }

    // Recalculate user's budget if premiumPercentage was set
    if (premiumPercentage) {
      await recalculateUserBudget(userId)
    }

    return updatedList as unknown as TaskList
  }

  // Recalculate user's budget if premiumPercentage was set
  if (premiumPercentage) {
    await recalculateUserBudget(userId)
  }

  return taskList as unknown as TaskList
}

/**
 * Update an existing task list
 * Updates Task records in the Task collection (no longer uses templateTasks)
 */
export async function updateTaskList(params: {
  taskListId: string
  userId: string
  role?: string
  name?: string
  budget?: number
  premiumPercentage?: number
  budgetDistribution?: BudgetDistribution
  dueDate?: string | Date
  templateId?: string | null
  tasks?: Task[]
  collaborators?: string[]
}): Promise<TaskList> {
  const { taskListId, userId, role, name, budget, premiumPercentage, budgetDistribution, dueDate, tasks, collaborators } = await params

  const existing = await prisma.list.findUnique({ 
    where: { id: taskListId },
    include: { tasks: true }
  })
  if (!existing) {
    throw new Error('TaskList not found')
  }

  console.log('[DEBUG] updateTaskList - incoming budgetDistribution:', JSON.stringify(budgetDistribution, null, 2))
  console.log('[DEBUG] updateTaskList - budgetDistribution !== undefined:', budgetDistribution !== undefined)

  // Update the list (no longer updating templateTasks - deprecated)
  const updated = await prisma.list.update({
    where: { id: existing.id },
    data: {
      // templateTasks is deprecated - we use Task collection instead
      role: typeof role === 'string' ? role : existing.role,
      name: name !== undefined ? name : existing.name,
      budget: budget !== undefined ? budget : existing.budget,
      premiumPercentage: premiumPercentage !== undefined ? premiumPercentage : (existing as Record<string, unknown>).premiumPercentage,
      budgetDistribution: budgetDistribution !== undefined ? budgetDistribution : (existing as Record<string, unknown>).budgetDistribution,
      dueDate: dueDate !== undefined ? dueDate : existing.dueDate,
      users: Array.isArray(collaborators)
        ? [
            ...((existing.users as TaskListMembership[]) || []).filter((u) => u.role === 'OWNER'),
            ...collaborators.map((id) => ({ userId: id, role: 'COLLABORATOR' as const }))
          ]
        : existing.users
    } as Record<string, unknown>,
    include: { template: true, tasks: true }
  })

  // Handle Task collection updates if tasks were provided
  if (Array.isArray(tasks)) {
    // existing.tasks is available from the include: { tasks: true } query
    const existingTasks = existing.tasks || []
    const existingTaskIds = new Set(existingTasks.map((t) => t.id))
    const incomingTaskIds = new Set(tasks.filter(t => t.id).map(t => t.id))

    // Find tasks to delete (exist in DB but not in incoming)
    const tasksToDelete = existingTasks.filter((t) => !incomingTaskIds.has(t.id))

    // Find tasks to create (new tasks without ID or with non-existing ID)
    const tasksToCreate = tasks.filter(t => !t.id || !existingTaskIds.has(t.id))

    // Find tasks to update (exist in both)
    const tasksToUpdate = tasks.filter(t => t.id && existingTaskIds.has(t.id))

    // Delete removed tasks
    if (tasksToDelete.length > 0) {
      await prisma.task.deleteMany({
        where: { id: { in: tasksToDelete.map((t) => t.id) } }
      })
    }

    // Create new tasks
    if (tasksToCreate.length > 0) {
      // Build recurrence rule based on list role/cadence
      const listRole = typeof role === 'string' ? role : existing.role
      let recurrence: { frequency: string; interval: number; byWeekday: number[]; byMonthDay: number[]; byMonth: number[] } | undefined = undefined
      if (listRole) {
        if (listRole.startsWith('daily')) {
          recurrence = { frequency: 'DAILY', interval: 1, byWeekday: [], byMonthDay: [], byMonth: [] }
        } else if (listRole.startsWith('weekly')) {
          recurrence = { frequency: 'WEEKLY', interval: 1, byWeekday: [], byMonthDay: [], byMonth: [] }
        }
      }

      const createPromises = tasksToCreate.map((task) =>
        prisma.task.create({
          data: {
            name: task.name,
            categories: task.categories || [],
            area: task.area || 'self',
            status: 'OPEN',
            listId: taskListId,
            recurrence: recurrence,
            times: task.times || 1,
            localeKey: task.localeKey,
            budget: task.budget,
            visibility: task.visibility,
            quality: task.quality,
            redacted: task.redacted || false,
            persons: task.persons || [],
            things: task.things || [],
            events: task.events || [],
            notes: task.notes || [],
            documents: task.documents || [],
          }
        })
      )
      await Promise.all(createPromises)
    }

    // Update existing tasks
    if (tasksToUpdate.length > 0) {
      const updatePromises = tasksToUpdate.map((task) =>
        prisma.task.update({
          where: { id: task.id },
          data: {
            name: task.name,
            categories: task.categories || [],
            area: task.area || 'self',
            times: task.times || 1,
            localeKey: task.localeKey,
            budget: task.budget,
            visibility: task.visibility,
            quality: task.quality,
            redacted: task.redacted,
            persons: task.persons || [],
            things: task.things || [],
            events: task.events || [],
            notes: task.notes || [],
            documents: task.documents || [],
          }
        })
      )
      await Promise.all(updatePromises)
    }

    // Refresh all task values (task list structure changed)
    await refreshListTaskValues(taskListId)

    // Re-fetch with updated tasks
    const finalList = await prisma.list.findUnique({
      where: { id: taskListId },
      include: { template: true, tasks: true }
    })

    if (!finalList) {
      throw new Error('Failed to fetch updated TaskList')
    }

    // Recalculate user's budget if premiumPercentage was updated
    if (premiumPercentage !== undefined) {
      await recalculateUserBudget(userId)
    }

    return finalList as unknown as TaskList
  }

  // Refresh task values if budget-related fields changed (no task structure changes)
  const budgetFieldsChanged = budget !== undefined || premiumPercentage !== undefined || budgetDistribution !== undefined
  if (budgetFieldsChanged) {
    await refreshListTaskValues(taskListId)
  }

  // Recalculate user's budget if premiumPercentage was updated
  if (premiumPercentage !== undefined) {
    await recalculateUserBudget(userId)
  }

  // Re-fetch to get updated task values
  if (budgetFieldsChanged) {
    const refreshedList = await prisma.list.findUnique({
      where: { id: taskListId },
      include: { template: true, tasks: true }
    })
    return refreshedList as unknown as TaskList
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
 * Get a task list with its template and tasks
 */
export async function getTaskListWithTemplate(taskListId: string): Promise<TaskList | null> {
  const taskList = await prisma.list.findUnique({
    where: { id: taskListId },
    include: { template: true, tasks: true }
  })

  return taskList as unknown as TaskList | null
}
