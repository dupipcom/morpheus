/**
 * PRISMA DATA MIGRATION SCRIPT
 * -----------------------------
 *
 * Purpose:
 * Update all task statuses in List.ephemeralTasks.open arrays to "open".
 * This migration replaces any status value (e.g., "Not started", "Open", "done", etc.)
 * with "open" for all tasks in the ephemeralTasks.open array in all lists.
 *
 * How to Run:
 *   node src/migrations/0013-update-ephemeral-tasks-status-to-open.js
 *
 * IMPORTANT:
 * ALWAYS back up your database before running a migration script.
 */

const { PrismaClient } = require('../../generated/prisma')

// Logger helper function for consistent console logging format
const logger = (str, originalMessage) => {
  // Convert objects to strings to avoid circular references
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

  // Determine colors based on message content
  const isDb = str.includes('db')
  const isError = str.includes('error')
  const isIdle = str.includes('idle')
  const isWarning = str.includes('warning')

  // Create console.log color settings object
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

// Instantiate Prisma Client
const prisma = new PrismaClient()

/**
 * Helper function to update task status to "open"
 */
function updateTaskStatus(task) {
  if (!task || typeof task !== 'object') {
    return task
  }

  const currentStatus = task.status || task.taskStatus
  
  // Only update if status exists and is not already "open"
  if (currentStatus && currentStatus.toLowerCase() !== 'open') {
    // Create updated task object
    const updatedTask = { ...task }
    
    // Update status field (remove taskStatus if it exists, set status to "open")
    if (updatedTask.taskStatus) {
      delete updatedTask.taskStatus
    }
    updatedTask.status = 'open'
    
    return { task: updatedTask, wasUpdated: true }
  }
  
  // Ensure status is set to "open" even if it was missing
  if (!currentStatus) {
    const updatedTask = {
      ...task,
      status: 'open'
    }
    if (task.taskStatus) {
      delete updatedTask.taskStatus
    }
    return { task: updatedTask, wasUpdated: true }
  }
  
  return { task, wasUpdated: false }
}

/**
 * The main migration function.
 */
async function main() {
  logger('migration_start', 'Updating ephemeralTasks.open task statuses to "open"')

  // 1. Fetch all lists from the database
  const lists = await prisma.list.findMany({
    select: {
      id: true,
      ephemeralTasks: true
    }
  })

  logger('migration_lists_found', `Found ${lists.length} lists`)

  let updatedCount = 0
  let totalTasksUpdated = 0
  const updatePromises = []

  // 2. Loop through each list
  for (const list of lists) {
    const ephemeralTasks = list.ephemeralTasks || {}
    const openTasks = Array.isArray(ephemeralTasks.open) ? ephemeralTasks.open : []
    
    if (openTasks.length === 0) {
      logger('migration_skip_empty_ephemeral', { listId: list.id })
      continue
    }

    // 3. Update all task statuses in ephemeralTasks.open array
    let hasChanges = false
    let tasksUpdated = 0
    const updatedOpenTasks = openTasks.map((task) => {
      const result = updateTaskStatus(task)
      if (result.wasUpdated) {
        hasChanges = true
        tasksUpdated++
        totalTasksUpdated++
        logger('migration_task_status_updated', {
          listId: list.id,
          taskName: task.name || 'unnamed',
          oldStatus: task.status || task.taskStatus || 'missing',
          newStatus: 'open',
          array: 'ephemeralTasks.open'
        })
      }
      return result.task
    })

    // 4. If tasks were modified, add update operation
    if (hasChanges) {
      updatedCount++
      
      // Preserve the existing ephemeralTasks structure (including closed array if it exists)
      const updatedEphemeralTasks = {
        ...ephemeralTasks,
        open: updatedOpenTasks
      }
      
      const updatePromise = prisma.list.update({
        where: { id: list.id },
        data: {
          ephemeralTasks: updatedEphemeralTasks
        }
      })
      updatePromises.push(updatePromise)
      logger('migration_list_queued_for_update', {
        listId: list.id,
        ephemeralTasksUpdated: tasksUpdated
      })
    }
  }

  // 5. Execute all update promises in a single transaction
  if (updatePromises.length > 0) {
    logger('migration_applying_updates', `Applying ${updatedCount} list updates (${totalTasksUpdated} ephemeralTasks.open tasks total)`)
    await prisma.$transaction(updatePromises)
    logger('migration_success', `Successfully updated ${updatedCount} lists with ${totalTasksUpdated} ephemeralTasks.open tasks total`)
  } else {
    logger('migration_complete', 'No lists needed updates - all ephemeralTasks.open tasks already have status "open"')
  }
}

// 6. Execute the main function and handle potential errors
main()
  .catch((e) => {
    logger('migration_failed', `Migration failed: ${e.message || e}`)
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    // 7. Ensure the Prisma Client disconnects after the script finishes
    await prisma.$disconnect()
  })

