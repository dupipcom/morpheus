/**
 * PRISMA DATA MIGRATION SCRIPT
 * -----------------------------
 *
 * Purpose:
 * Create two TaskLists per user (daily.default and weekly.default)
 * using Templates fetched from the database.
 *
 * - Links each TaskList to its Template via templateId
 * - Copies template tasks into templateTasks and tasks
 * - Sets owners to the respective user and visibility to PRIVATE
 * - Skips creation if a TaskList for that role already exists
 *
 * How to Run:
 *   node src/migrations/0006-create-tasklists-from-db-templates.js
 */

const { PrismaClient } = require('../../generated/prisma')

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

async function ensureListForUser(userId, role, template) {
  const existing = await prisma.taskList.findFirst({
    where: {
      owners: { has: userId },
      role
    }
  })

  if (existing) {
    logger('migration_tasklist_exists', { userId, role, id: existing.id })
    return { id: existing.id, created: false }
  }

  if (!template) {
    logger('migration_missing_template', { userId, role })
    return { id: null, created: false }
  }

  const templateTasks = Array.isArray(template.tasks) ? template.tasks : []

  const created = await prisma.taskList.create({
    data: {
      role,
      visibility: 'PRIVATE',
      owners: [userId],
      templateId: template.id,
      templateTasks,
      tasks: templateTasks,
      ephemeralTasks: { open: [], closed: [] },
      completedTasks: {}
    }
  })

  logger('migration_tasklist_created', { userId, role, id: created.id })
  return { id: created.id, created: true }
}

async function main() {
  logger('migration_start', 'create tasklists from db templates')

  const dailyTemplate = await prisma.template.findFirst({ where: { role: 'daily.default' } })
  const weeklyTemplate = await prisma.template.findFirst({ where: { role: 'weekly.default' } })

  if (!dailyTemplate) logger('migration_warning_no_daily_template_found')
  if (!weeklyTemplate) logger('migration_warning_no_weekly_template_found')

  const users = await prisma.user.findMany()
  logger('migration_documents_found', `Found ${users.length} users`)

  let createdCount = 0
  let skippedCount = 0

  for (const user of users) {
    const dailyResult = await ensureListForUser(user.id, 'daily.default', dailyTemplate)
    const weeklyResult = await ensureListForUser(user.id, 'weekly.default', weeklyTemplate)

    createdCount += (dailyResult.created ? 1 : 0) + (weeklyResult.created ? 1 : 0)
    skippedCount += (dailyResult.created ? 0 : 1) + (weeklyResult.created ? 0 : 1)
  }

  logger('migration_summary', { createdCount, skippedCount })
}

main()
  .catch((e) => {
    logger('migration_failed', `Migration failed: ${e}`)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })




