/**
 * TaskList CRUD service
 * Handles create, read, update, delete operations for task lists
 */

import prisma from '@/lib/prisma'
import type { List, Prisma } from '@/generated/prisma'
import { DAILY_ACTIONS, WEEKLY_ACTIONS } from '@/app/constants'
import { recalculateUserBudget } from '@/lib/utils/budgetUtils'
import { buildRRuleFromLegacy, rruleFromListRole, slugifyList } from '@/lib/utils/rruleUtils'
import {
  ensureUniqueTaskIds,
  translateTemplateTasks,
  getLocalizedListName
} from './helpers'
import type { TaskList } from './types'

/** Shape of a task entry in DAILY_ACTIONS / WEEKLY_ACTIONS */
interface DefaultAction {
  name: string
  localeKey?: string | null
  times?: number | null
  categories?: string[]
  area?: string | null
  recurrence?: {
    frequency?: string | null
    interval?: number | null
    byWeekday?: number[]
    byMonthDay?: number[]
    byMonth?: number[]
  } | null
}

/** Input shape for a task created together with a list */
export interface NewTaskInput {
  name: string
  rrule?: string | null
  dtstart?: string | null
  times?: number | null
  premium?: number | null
  premiumType?: string | null
  localeKey?: string | null
  categories?: string[]
  area?: string
  visibility?: string | null
  quality?: number | null
  redacted?: boolean | null
}

/**
 * Get task lists for a user (owned, managed, or collaborated)
 * Includes tasks from the Task collection
 */
export async function getTaskListsForUser(params: {
  userId: string
  role?: string | null
}): Promise<List[]> {
  const { userId, role } = params

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

  return prisma.list.findMany({
    where: whereClause as Prisma.ListWhereInput,
    include: {
      tasks: true // Tasks from the Task collection
    },
    orderBy: {
      createdAt: 'asc'
    }
  })
}

/**
 * Ensure default task lists exist for a user
 * Creates the daily/weekly lists and their Task records directly from the
 * DAILY_ACTIONS / WEEKLY_ACTIONS constants (no Template dependency).
 * Idempotent: only creates a list when the user does not own one with that role.
 */
export async function ensureDefaultTaskLists(params: {
  userInternalId: string
  translations: Record<string, unknown>
}): Promise<void> {
  const { userInternalId, translations } = params

  const defaults: Array<{ role: string; actions: Array<Record<string, unknown>> }> = [
    { role: 'daily.default', actions: DAILY_ACTIONS },
    { role: 'weekly.default', actions: WEEKLY_ACTIONS }
  ]

  for (const { role, actions } of defaults) {
    const existing = await prisma.list.findFirst({
      where: { users: { some: { userId: userInternalId, role: 'OWNER' } }, role }
    })
    if (existing) continue

    const localizedName = getLocalizedListName(role, translations)

    // Localize task names via their localeKey
    const translatedTasks = translateTemplateTasks(
      ensureUniqueTaskIds(actions as never[], true),
      translations
    ) as unknown as DefaultAction[]

    const defaultRRule = rruleFromListRole(role)

    const newList = await prisma.list.create({
      data: {
        role,
        name: localizedName,
        visibility: 'PRIVATE',
        users: [{ userId: userInternalId, role: 'OWNER' }]
      }
    })

    const taskCreatePromises = translatedTasks.map((task) =>
      prisma.task.create({
        data: {
          name: task.name,
          categories: (task.categories || []) as never,
          area: (task.area || 'self') as never,
          status: 'OPEN',
          listId: newList.id,
          rrule: buildRRuleFromLegacy(task.recurrence) || defaultRRule,
          times: task.times || 1,
          localeKey: task.localeKey
        }
      })
    )
    await Promise.all(taskCreatePromises)
  }
}

/**
 * Generate a unique public URL slug for a list (retries on collision)
 */
export async function generatePublicUrl(name: string | null | undefined, id: string): Promise<string> {
  const suffix = id.slice(-4)
  let slug = slugifyList(name, suffix)
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.list.findFirst({ where: { publicUrl: slug }, select: { id: true } })
    if (!existing || existing.id === id) return slug
    slug = slugifyList(name, `${suffix}-${attempt + 1}`)
  }
  return `${slug}-${Date.now()}`
}

/**
 * Create a new task list (plus its initial tasks)
 */
export async function createTaskList(params: {
  userInternalId: string
  role?: string | null
  name?: string | null
  visibility?: string
  categories?: string[]
  area?: string | null
  collaborators?: string[]
  budget?: number | null
  budgetType?: string | null
  budgetPercent?: number | null
  budgetSourceIds?: string[]
  bio?: string | null
  profilePhoto?: string | null
  links?: unknown
  tasks?: NewTaskInput[]
}): Promise<List> {
  const {
    userInternalId, role, name, visibility, categories, area, collaborators,
    budget, budgetType, budgetPercent, budgetSourceIds,
    bio, profilePhoto, links, tasks
  } = params

  // If creating a new default list, demote the existing default to custom
  if (role && role.endsWith('.default')) {
    const existingDefault = await prisma.list.findFirst({
      where: {
        users: { some: { userId: userInternalId, role: 'OWNER' } },
        role
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
      role: role || 'custom',
      name: name || null,
      visibility: (visibility as List['visibility']) || 'PRIVATE',
      categories: (categories || []) as never,
      area: (area || null) as never,
      users: [
        { userId: userInternalId, role: 'OWNER' },
        ...(Array.isArray(collaborators) ? collaborators.map((id) => ({ userId: id, role: 'COLLABORATOR' as const })) : [])
      ] as never,
      budget: budget || null,
      budgetType: budgetType || null,
      budgetPercent: budgetPercent || null,
      budgetSourceIds: budgetSourceIds || [],
      bio: bio || null,
      profilePhoto: profilePhoto || null,
      links: links ?? null
    }
  })

  // Assign a unique public slug
  const publicUrl = await generatePublicUrl(taskList.name, taskList.id)
  const finalList = await prisma.list.update({
    where: { id: taskList.id },
    data: { publicUrl }
  })

  // Create initial Task records
  if (Array.isArray(tasks) && tasks.length > 0) {
    const defaultRRule = rruleFromListRole(role)
    const taskCreatePromises = tasks.map((task) =>
      prisma.task.create({
        data: {
          name: task.name,
          categories: (task.categories || []) as never,
          area: (task.area || 'self') as never,
          status: 'OPEN',
          listId: finalList.id,
          rrule: task.rrule ?? defaultRRule,
          dtstart: task.dtstart || null,
          times: task.times || 1,
          premium: task.premium || null,
          premiumType: task.premiumType || null,
          localeKey: task.localeKey || null,
          visibility: (task.visibility as never) || null,
          quality: task.quality || null,
          redacted: task.redacted || false
        }
      })
    )
    await Promise.all(taskCreatePromises)
  }

  await recalculateUserBudget(userInternalId)

  return prisma.list.findUnique({
    where: { id: finalList.id },
    include: { tasks: true }
  }) as Promise<List>
}

/**
 * Update an existing task list
 */
export async function updateTaskList(params: {
  taskListId: string
  role?: string | null
  name?: string | null
  visibility?: string
  categories?: string[]
  area?: string | null
  collaborators?: string[]
  budget?: number | null
  budgetType?: string | null
  budgetPercent?: number | null
  budgetSourceIds?: string[]
  bio?: string | null
  profilePhoto?: string | null
  links?: unknown
}): Promise<List> {
  const {
    taskListId, role, name, visibility, categories, area, collaborators,
    budget, budgetType, budgetPercent, budgetSourceIds,
    bio, profilePhoto, links
  } = params

  const existing = await prisma.list.findUnique({
    where: { id: taskListId }
  })
  if (!existing) {
    throw new Error('TaskList not found')
  }

  const updated = await prisma.list.update({
    where: { id: existing.id },
    data: {
      role: role !== undefined ? role : existing.role,
      name: name !== undefined ? name : existing.name,
      visibility: visibility !== undefined ? (visibility as List['visibility']) : existing.visibility,
      categories: categories !== undefined ? (categories as never) : existing.categories,
      area: area !== undefined ? (area as never) : existing.area,
      users: (Array.isArray(collaborators)
        ? [
            ...((existing.users as Array<{ userId: string; role: string }>) || []).filter((u) => u.role === 'OWNER'),
            ...collaborators.map((id) => ({ userId: id, role: 'COLLABORATOR' as const }))
          ]
        : existing.users) as never,
      budget: budget !== undefined ? budget : existing.budget,
      budgetType: budgetType !== undefined ? budgetType : existing.budgetType,
      budgetPercent: budgetPercent !== undefined ? budgetPercent : existing.budgetPercent,
      budgetSourceIds: budgetSourceIds !== undefined ? budgetSourceIds : existing.budgetSourceIds,
      bio: bio !== undefined ? bio : existing.bio,
      profilePhoto: profilePhoto !== undefined ? profilePhoto : existing.profilePhoto,
      links: links !== undefined ? links : existing.links
    },
    include: { tasks: true }
  })

  return updated
}

/**
 * Delete a task list
 */
export async function deleteTaskList(params: {
  taskListId: string
  userInternalId: string
}): Promise<void> {
  const { taskListId, userInternalId } = params

  const existing = await prisma.list.findUnique({ where: { id: taskListId } })
  if (!existing) {
    throw new Error('TaskList not found')
  }

  await prisma.list.delete({ where: { id: taskListId } })

  // Recalculate the owner's budget usage after deleting a list
  await recalculateUserBudget(userInternalId)
}

/**
 * Get a task list with its tasks
 */
export async function getTaskListWithTasks(taskListId: string): Promise<List | null> {
  return prisma.list.findUnique({
    where: { id: taskListId },
    include: { tasks: true }
  })
}

// Type re-export keeps other modules compiling until they are reworked
export type { TaskList }
