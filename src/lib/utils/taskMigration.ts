/**
 * Task Migration Utilities
 *
 * Helpers to migrate from old embedded task structure to new Task collection
 */

import prisma from '@/lib/prisma'
import { TaskStatus } from '@/generated/prisma'

/**
 * Convert old status string to new TaskStatus enum
 */
export function convertStatus(oldStatus: string): TaskStatus {
  const statusMap: Record<string, TaskStatus> = {
    'open': TaskStatus.OPEN,
    'in progress': TaskStatus.IN_PROGRESS,
    'steady': TaskStatus.STEADY,
    'ready': TaskStatus.READY,
    'done': TaskStatus.DONE,
    'ignored': TaskStatus.IGNORED
  }
  return statusMap[oldStatus.toLowerCase()] || TaskStatus.OPEN
}

/**
 * Migrate a single list's embedded tasks to Task collection
 */
export async function migrateListTasks(listId: string) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: {
      id: true,
      tasks: true,
      templateTasks: true
    }
  })

  if (!list) {
    throw new Error(`List ${listId} not found`)
  }

  // @ts-ignore - tasks is EmbeddedTask[]
  const embeddedTasks = list.tasks?.length > 0 ? list.tasks : list.templateTasks || []

  const migratedTasks = []

  for (const embeddedTask of embeddedTasks) {
    try {
      // Check if task already exists in collection (by name + listId or localeKey)
      const existingTask = await prisma.task.findFirst({
        where: {
          listId: list.id,
          OR: [
            { name: embeddedTask.name },
            ...(embeddedTask.localeKey ? [{ localeKey: embeddedTask.localeKey }] : [])
          ]
        }
      })

      if (existingTask) {
        console.log(`Task "${embeddedTask.name}" already exists, skipping`)
        continue
      }

      // Create task in collection
      const newTask = await prisma.task.create({
        data: {
          name: embeddedTask.name,
          categories: embeddedTask.categories || [],
          area: embeddedTask.area,
          status: convertStatus(embeddedTask.status || 'open'),
          recurrence: embeddedTask.recurrence || undefined,
          nextOccurrence: embeddedTask.nextOccurrence || undefined,
          lastOccurrence: embeddedTask.lastOccurrence || undefined,
          firstOccurrence: embeddedTask.firstOccurrence || undefined,
          times: embeddedTask.times || undefined,
          count: embeddedTask.count || undefined,
          localeKey: embeddedTask.localeKey || undefined,
          persons: embeddedTask.persons || [],
          things: embeddedTask.things || [],
          events: embeddedTask.events || [],
          notes: embeddedTask.notes || [],
          documents: embeddedTask.documents || [],
          favorite: embeddedTask.favorite || undefined,
          isEphemeral: embeddedTask.isEphemeral || undefined,
          completedOn: embeddedTask.completedOn || undefined,
          dueDate: embeddedTask.dueDate || undefined,
          budget: embeddedTask.budget || undefined,
          visibility: embeddedTask.visibility || 'PRIVATE',
          quality: embeddedTask.quality || undefined,
          redacted: embeddedTask.redacted || false,
          listId: list.id
        }
      })

      migratedTasks.push(newTask)

      // Migrate completers to Jobs if they exist
      if (embeddedTask.completers && Array.isArray(embeddedTask.completers)) {
        for (const completer of embeddedTask.completers) {
          await prisma.job.create({
            data: {
              taskId: newTask.id,
              listId: list.id,
              operatorId: completer.id,
              status: 'ACCEPTED', // Completers are already accepted
              selfReview: completer.prize || undefined,
              createdAt: completer.completedAt,
              updatedAt: completer.completedAt
            }
          })
        }
      }
    } catch (error) {
      console.error(`Error migrating task "${embeddedTask.name}":`, error)
    }
  }

  return {
    listId: list.id,
    migratedCount: migratedTasks.length,
    totalEmbedded: embeddedTasks.length
  }
}

/**
 * Migrate all lists for a user
 */
export async function migrateUserTasks(userId: string) {
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { id: true }
  })

  if (!user) {
    throw new Error(`User ${userId} not found`)
  }

  // Find all lists where user is a member
  const lists = await prisma.list.findMany({
    where: {
      users: {
        some: {
          userId: user.id
        }
      }
    },
    select: { id: true, name: true }
  })

  const results = []

  for (const list of lists) {
    try {
      const result = await migrateListTasks(list.id)
      results.push({
        listName: list.name,
        ...result
      })
    } catch (error) {
      console.error(`Error migrating list "${list.name}":`, error)
      results.push({
        listName: list.name,
        listId: list.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return results
}

/**
 * API endpoint helper - call this from a migration endpoint
 */
export async function migrateSingleList(listId: string) {
  try {
    const result = await migrateListTasks(listId)
    return {
      success: true,
      ...result
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
