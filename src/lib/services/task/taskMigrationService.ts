/**
 * Task Migration Service (deprecated runtime path)
 *
 * The legacy on-the-fly migration of embedded tasks (templateTasks/completers)
 * to the Task collection was replaced by one-time data migrations 0017-0019
 * (run before deploying the rebuilt Do module). The /api/v1/tasks/migrate
 * route is kept for API compatibility and always reports migration complete.
 */

import prisma from '@/lib/prisma'
import type { MigrationResult, MigrateListTasksParams } from './types'

/**
 * Legacy entry point kept for API compatibility.
 * All conversions now happen via src/migrations/0017-0019.
 */
export async function migrateListTasks(params: MigrateListTasksParams): Promise<MigrationResult> {
  // Deprecated no-op: conversions now happen via src/migrations/0017-0019
  void params
  return {
    tasksCreated: 0,
    jobsCreated: 0,
    skipped: 0,
    errors: [],
    migratedTasks: []
  }
}

/**
 * Check if a list needs migration. Always false post-rebuild:
 * the one-time migrations have already converted everything.
 */
export async function listNeedsMigration(listId: string): Promise<{
  needsMigration: boolean
  legacyTaskCount: number
  migratedTaskCount: number
}> {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: {
      _count: {
        select: { tasks: true }
      }
    }
  })

  if (!list) {
    return { needsMigration: false, legacyTaskCount: 0, migratedTaskCount: 0 }
  }

  return {
    needsMigration: false,
    legacyTaskCount: 0,
    migratedTaskCount: list._count.tasks
  }
}
