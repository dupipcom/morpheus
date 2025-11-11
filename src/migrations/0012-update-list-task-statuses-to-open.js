/**
 * PRISMA DATA MIGRATION SCRIPT
 * -----------------------------
 *
 * Purpose:
 * Update all task statuses in List documents to "open".
 * This migration replaces any status value (e.g., "Not started", "Open", "done", etc.)
 * with "open" for all tasks in both `tasks` and `templateTasks` arrays in all lists.
 *
 * How to Run:
 *   node src/migrations/0012-update-list-task-statuses-to-open.js
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
  logger('migration_start', 'Updating list task statuses to "open"')

  // 1. Fetch all lists from the database
  const lists = await prisma.list.findMany({
    select: {
      id: true,
      tasks: true,
      templateTasks: true
    }
  })

  logger('migration_lists_found', `Found ${lists.length} lists`)

  let updatedCount = 0
  let totalTasksUpdated = 0
  let totalTemplateTasksUpdated = 0
  const updatePromises = []

  // 2. Loop through each list
  for (const list of lists) {
    const tasks = Array.isArray(list.tasks) ? list.tasks : []
    const templateTasks = Array.isArray(list.templateTasks) ? list.templateTasks : []
    
    if (tasks.length === 0 && templateTasks.length === 0) {
      logger('migration_skip_empty_list', { listId: list.id })
      continue
    }

    // 3. Update all task statuses in tasks array
    let hasChanges = false
    let tasksUpdated = 0
    const updatedTasks = tasks.map((task) => {
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
          array: 'tasks'
        })
      }
      return result.task
    })

    // 4. Update all task statuses in templateTasks array
    let templateTasksUpdated = 0
    const updatedTemplateTasks = templateTasks.map((task) => {
      const result = updateTaskStatus(task)
      if (result.wasUpdated) {
        hasChanges = true
        templateTasksUpdated++
        totalTemplateTasksUpdated++
        logger('migration_task_status_updated', {
          listId: list.id,
          taskName: task.name || 'unnamed',
          oldStatus: task.status || task.taskStatus || 'missing',
          newStatus: 'open',
          array: 'templateTasks'
        })
      }
      return result.task
    })

    // 5. If tasks were modified, add update operation
    if (hasChanges) {
      updatedCount++
      const updateData = {}
      
      if (tasksUpdated > 0) {
        updateData.tasks = updatedTasks
      }
      
      if (templateTasksUpdated > 0) {
        updateData.templateTasks = updatedTemplateTasks
      }
      
      const updatePromise = prisma.list.update({
        where: { id: list.id },
        data: updateData
      })
      updatePromises.push(updatePromise)
      logger('migration_list_queued_for_update', {
        listId: list.id,
        tasksUpdated: tasksUpdated,
        templateTasksUpdated: templateTasksUpdated
      })
    }
  }

  // 6. Execute all update promises in a single transaction
  if (updatePromises.length > 0) {
    logger('migration_applying_updates', `Applying ${updatedCount} list updates (${totalTasksUpdated} tasks + ${totalTemplateTasksUpdated} templateTasks = ${totalTasksUpdated + totalTemplateTasksUpdated} total)`)
    await prisma.$transaction(updatePromises)
    logger('migration_success', `Successfully updated ${updatedCount} lists with ${totalTasksUpdated + totalTemplateTasksUpdated} tasks total`)
  } else {
    logger('migration_complete', 'No lists needed updates - all tasks already have status "open"')
  }
}

// 7. Execute the main function and handle potential errors
main()
  .catch((e) => {
    logger('migration_failed', `Migration failed: ${e.message || e}`)
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    // 8. Ensure the Prisma Client disconnects after the script finishes
    await prisma.$disconnect()
  })

