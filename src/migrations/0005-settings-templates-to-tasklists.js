/**
 * PRISMA DATA MIGRATION SCRIPT
 * -----------------------------
 *
 * Purpose:
 * Create TaskLists for each user by copying tasks from
 * user.settings.dailyTemplate and user.settings.weeklyTemplate.
 *
 * - Creates two TaskLists per user (daily.default, weekly.default)
 * - Sets owners to the respective user
 * - Sets templateId to null (no linked Template)
 * - Sets templateTasks (and tasks) to the settings values
 * - Skips creation if a TaskList for that role already exists; updates its tasks instead
 *
 * How to Run:
 * 1. Save this file in your project (e.g., src/migrations)
 * 2. Run from terminal: `node src/migrations/0005-settings-templates-to-tasklists.js`
 *
 * IMPORTANT: Always back up your database before running a migration script.
 */

const { PrismaClient } = require('../../generated/prisma')

// Logger helper function for consistent console logging format
const logger = (str, originalMessage) => {
  let message = str
  if (originalMessage !== undefined) {
    if (typeof originalMessage === 'object') {
      try {
        message = `${str} - ${JSON.stringify(originalMessage, null, 2)}`
      } catch (error) {
        message = `${str} - [Object - circular reference or non-serializable]`
      }
    } else {
      message = `${str} - ${String(originalMessage)}`
    }
  }

  const isDb = str.includes('db')
  const isError = str.includes('error')
  const isIdle = str.includes('idle')
  const isWarning = str.includes('warning')

  const colorSettings = {
    background: isDb ? 'cyan' : '#1f1f1f',
    color: isError ? 'red' : isIdle || isWarning ? 'yellow' : 'green',
    fontWeight: 'bold',
    padding: '2px 4px',
    borderRadius: '3px'
  }

  console.log(
    `%cdpip::morpheus::${message}`,
    `background: ${colorSettings.background}; color: ${colorSettings.color}; font-weight: ${colorSettings.fontWeight}; padding: ${colorSettings.padding}; border-radius: ${colorSettings.borderRadius};`
  )
}

const prisma = new PrismaClient()

async function upsertListForUser(user, role, tasks) {
  const existing = await prisma.taskList.findFirst({
    where: {
      owners: { has: user.id },
      role
    }
  })

  // Ensure arrays
  const templateTasks = Array.isArray(tasks) ? tasks : []

  if (existing) {
    // Update existing list's templateTasks/tasks if we have anything meaningful to copy
    if (templateTasks.length > 0) {
      await prisma.taskList.update({
        where: { id: existing.id },
        data: {
          templateId: null,
          templateTasks,
          tasks: templateTasks,
          updatedAt: new Date()
        }
      })
      logger('migration_tasklist_updated', { userId: user.id, role, id: existing.id })
      return { id: existing.id, action: 'updated' }
    } else {
      logger('migration_tasklist_skipped_update_no_tasks', { userId: user.id, role, id: existing.id })
      return { id: existing.id, action: 'skipped' }
    }
  }

  // Create brand new list only if we have tasks to copy
  if (templateTasks.length === 0) {
    logger('migration_tasklist_skip_create_no_tasks', { userId: user.id, role })
    return { id: null, action: 'skipped' }
  }

  const created = await prisma.taskList.create({
    data: {
      role,
      visibility: 'PRIVATE',
      owners: [user.id],
      templateId: null,
      templateTasks,
      tasks: templateTasks,
      ephemeralTasks: { open: [], closed: [] },
      completedTasks: {}
    }
  })
  logger('migration_tasklist_created', { userId: user.id, role, id: created.id })
  return { id: created.id, action: 'created' }
}

async function main() {
  logger('migration_start', 'settings templates -> tasklists')

  const users = await prisma.user.findMany()
  logger('migration_documents_found', `Found ${users.length} users`)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const user of users) {
    const settings = user.settings || {}

    // Assume settings.dailyTemplate and settings.weeklyTemplate are arrays of Task
    const dailyTasks = Array.isArray(settings.dailyTemplate) ? settings.dailyTemplate : []
    const weeklyTasks = Array.isArray(settings.weeklyTemplate) ? settings.weeklyTemplate : []

    // Daily
    const dailyResult = await upsertListForUser(user, 'daily.default', dailyTasks)
    if (dailyResult.action === 'created') created++
    else if (dailyResult.action === 'updated') updated++
    else skipped++

    // Weekly
    const weeklyResult = await upsertListForUser(user, 'weekly.default', weeklyTasks)
    if (weeklyResult.action === 'created') created++
    else if (weeklyResult.action === 'updated') updated++
    else skipped++
  }

  logger('migration_summary', { created, updated, skipped })
}

main()
  .catch((e) => {
    logger('migration_failed', `Migration failed: ${e}`)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


