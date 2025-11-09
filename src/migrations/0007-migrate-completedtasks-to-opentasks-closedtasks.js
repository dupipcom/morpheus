/**
 * PRISMA DATA MIGRATION SCRIPT
 * -----------------------------
 *
 * Purpose:
 * Migrate completedTasks structure from array format to openTasks/closedTasks format.
 *
 * Old Structure:
 * completedTasks[year][date] = [task1, task2, ...]
 *
 * New Structure:
 * completedTasks[year][date] = {
 *   openTasks: [task1, task2, ...],
 *   closedTasks: [task3, task4, ...]
 * }
 *
 * Migration Logic:
 * - Tasks with status 'Done' or count >= times go to closedTasks
 * - All other tasks go to openTasks
 * - Dates that already have the new structure are preserved
 *
 * How to Run:
 * 1. Save this file in your project (e.g., src/migrations)
 * 2. Run from terminal: `node src/migrations/0007-migrate-completedtasks-to-opentasks-closedtasks.js`
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

/**
 * Helper function to determine if a task should be in closedTasks
 */
function isTaskClosed(task) {
  // Task is closed if status is 'Done' or count >= times
  const status = task?.status
  const count = Number(task?.count || 0)
  const times = Number(task?.times || 1)
  
  return status === 'Done' || count >= times
}

/**
 * Migrate a single date bucket from array to openTasks/closedTasks structure
 */
function migrateDateBucket(dateBucket) {
  // If already in new format, return as-is
  if (dateBucket && typeof dateBucket === 'object' && !Array.isArray(dateBucket)) {
    if (dateBucket.openTasks !== undefined || dateBucket.closedTasks !== undefined) {
      return dateBucket // Already migrated
    }
  }
  
  // If not an array, return empty structure
  if (!Array.isArray(dateBucket)) {
    return { openTasks: [], closedTasks: [] }
  }
  
  // Migrate array to new structure
  const openTasks = []
  const closedTasks = []
  
  for (const task of dateBucket) {
    if (isTaskClosed(task)) {
      closedTasks.push(task)
    } else {
      openTasks.push(task)
    }
  }
  
  return { openTasks, closedTasks }
}

/**
 * Migrate completedTasks for a single TaskList
 */
function migrateTaskListCompletedTasks(completedTasks) {
  if (!completedTasks || typeof completedTasks !== 'object') {
    return {}
  }
  
  const migrated = {}
  let datesMigrated = 0
  
  // Iterate through years
  for (const year in completedTasks) {
    const yearData = completedTasks[year]
    
    if (!yearData || typeof yearData !== 'object') {
      continue
    }
    
    migrated[year] = {}
    
    // Iterate through dates
    for (const date in yearData) {
      const dateBucket = yearData[date]
      const migratedBucket = migrateDateBucket(dateBucket)
      
      // Only count as migrated if it was an array (old format)
      if (Array.isArray(dateBucket)) {
        datesMigrated++
      }
      
      migrated[year][date] = migratedBucket
    }
  }
  
  return { migrated, datesMigrated }
}

async function main() {
  logger('migration_start', 'Migrating completedTasks from array to openTasks/closedTasks structure')
  
  const taskLists = await prisma.taskList.findMany({
    select: {
      id: true,
      completedTasks: true
    }
  })
  
  logger('migration_documents_found', `Found ${taskLists.length} task lists`)
  
  let totalListsUpdated = 0
  let totalDatesMigrated = 0
  let listsSkipped = 0
  
  for (const taskList of taskLists) {
    const completedTasks = taskList.completedTasks || {}
    
    // Migrate the structure
    const { migrated, datesMigrated } = migrateTaskListCompletedTasks(completedTasks)
    
    if (datesMigrated === 0) {
      // No dates needed migration, skip update
      listsSkipped++
      continue
    }
    
    // Update the task list with migrated structure
    try {
      await prisma.taskList.update({
        where: { id: taskList.id },
        data: {
          completedTasks: migrated,
          updatedAt: new Date()
        }
      })
      
      totalListsUpdated++
      totalDatesMigrated += datesMigrated
      
      logger('migration_tasklist_updated', {
        taskListId: taskList.id,
        datesMigrated
      })
    } catch (error) {
      logger('migration_error', {
        taskListId: taskList.id,
        error: error.message
      })
    }
  }
  
  logger('migration_summary', {
    totalLists: taskLists.length,
    listsUpdated: totalListsUpdated,
    listsSkipped,
    totalDatesMigrated
  })
  
  logger('migration_complete', 'Migration completed successfully')
}

main()
  .catch((e) => {
    logger('migration_failed', `Migration failed: ${e}`)
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

